const { v4: uuidv4 } = require('uuid');
const twilio = require('twilio');
const { buildBackendUrl } = require('../config/backendUrl');
const { decrypt } = require('../utils/encryption.js');
const crypto = require('crypto');
const axios = require('axios');
const emailService = require('./emailService.js');
const { LLMService } = require('../llmService.js');

class CampaignService {
    constructor(mysqlPool, walletService, costCalculator, llmService = null) {
        this.mysqlPool = mysqlPool;
        this.walletService = walletService;
        this.costCalculator = costCalculator;
        this.llmService = llmService; // LLM service for intent classification
        this.activeCampaigns = new Map(); // Track running campaigns
    }

    /**
     * Create a new campaign
     */
    async createCampaign(userId, agentId = null, name, description = '', phoneNumberId = null, concurrentCalls = 1, maxRetryAttempts = 0) {
        try {
            const campaignId = uuidv4();

            // Fetch user's current company ID
            const [user] = await this.mysqlPool.execute('SELECT current_company_id FROM users WHERE id = ?', [userId]);
            const companyId = user.length > 0 ? user[0].current_company_id : null;

            // Insert campaign with all columns, including max_retry_attempts
            await this.mysqlPool.execute(
                `INSERT INTO campaigns (id, user_id, agent_id, name, description, status, phone_number_id, concurrent_calls, max_retry_attempts, company_id)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?)`,
                [campaignId, userId, agentId, name, description, phoneNumberId, concurrentCalls, maxRetryAttempts, companyId]
            );

            // Create default settings
            await this.mysqlPool.execute(
                `INSERT INTO campaign_settings (id, campaign_id)
         VALUES (?, ?)`,
                [uuidv4(), campaignId]
            );

            return { success: true, campaignId };
        } catch (error) {
            console.error('Error creating campaign:', error);
            throw error;
        }
    }

    /**
     * Add contacts to campaign (bulk)
     * Now supports email field.
     */
    async addContacts(campaignId, contacts) {
        try {
            const values = contacts.map(contact => [
                uuidv4(),
                campaignId,
                contact.phone_number,
                contact.name || null,
                contact.email || null, // New: email field
                contact.metadata ? JSON.stringify(contact.metadata) : null
            ]);

            await this.mysqlPool.query(
                `INSERT INTO campaign_contacts (id, campaign_id, phone_number, name, email, metadata)
         VALUES ?`,
                [values]
            );

            // Update total contacts count
            await this.mysqlPool.execute(
                `UPDATE campaigns SET total_contacts = (
          SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?
        ) WHERE id = ?`,
                [campaignId, campaignId]
            );

            return { success: true, added: contacts.length };
        } catch (error) {
            console.error('Error adding contacts:', error);
            throw error;
        }
    }

    /**
     * Start a campaign
     */
    async startCampaign(campaignId, userId) {
        try {
            // Check if campaign is already running
            if (this.activeCampaigns.has(campaignId)) {
                throw new Error('Campaign is already running');
            }

            // Get campaign details to check phone_number_id and agent_id
            const [campaigns] = await this.mysqlPool.execute(
                'SELECT * FROM campaigns WHERE id = ? AND user_id = ?',
                [campaignId, userId]
            );

            if (campaigns.length === 0) {
                throw new Error('Campaign not found');
            }

            const campaign = campaigns[0];

            // Validate phone_number_id and agent_id
            if (!campaign.phone_number_id || !campaign.agent_id) {
                // Try to auto-assign from user's first available phone number
                const [phoneNumbers] = await this.mysqlPool.execute(
                    'SELECT id, agent_id FROM user_twilio_numbers WHERE user_id = ? AND agent_id IS NOT NULL LIMIT 1',
                    [userId]
                );

                if (phoneNumbers.length === 0) {
                    throw new Error('Please set a caller phone number with an assigned agent before starting the campaign. Go to campaign settings and click "Set Caller Phone".');
                }

                // Auto-assign the first available phone number
                await this.mysqlPool.execute(
                    'UPDATE campaigns SET phone_number_id = ?, agent_id = ? WHERE id = ?',
                    [phoneNumbers[0].id, phoneNumbers[0].agent_id, campaignId]
                );

                console.log(`✅ Auto-assigned phone number ${phoneNumbers[0].id} to campaign ${campaignId}`);
            }

            // Check if user has sufficient balance
            const balanceCheck = await this.walletService.checkBalanceForCall(userId, 1.00);
            if (!balanceCheck.allowed) {
                throw new Error('Insufficient balance to start campaign. Minimum $1.00 required.');
            }

            // Update campaign status (only if not already running or paused)
            const [result] = await this.mysqlPool.execute(
                `UPDATE campaigns SET status = 'running', started_at = NOW()
         WHERE id = ? AND status IN ('draft', 'paused', 'retrying')`, // Allow starting from 'retrying'
                [campaignId]
            );

            if (result.affectedRows === 0) {
                throw new Error('Campaign is already running or does not exist');
            }

            // Mark as active in memory (processCampaign will be called from server.js)
            this.activeCampaigns.set(campaignId, { status: 'running' });

            return { success: true, message: 'Campaign started' };
        } catch (error) {
            console.error('Error starting campaign:', error);
            throw error;
        }
    }

    /**
     * Process campaign - make calls to all contacts with concurrent call limit
     * Includes retry logic.
     */
    async processCampaign(campaignId, userId) {
        try {
            console.log(`📞 Starting campaign ${campaignId}`);
            this.activeCampaigns.set(campaignId, { status: 'running' });

            // Get campaign details
            const [campaigns] = await this.mysqlPool.execute(
                `SELECT c.*, a.voice_id, a.identity, a.settings
         FROM campaigns c
         JOIN agents a ON c.agent_id = a.id
         WHERE c.id = ?`,
                [campaignId]
            );

            if (campaigns.length === 0) {
                throw new Error('Campaign not found');
            }

            const campaign = campaigns[0];
            const agentSettings = typeof campaign.settings === 'string'
                ? JSON.parse(campaign.settings)
                : campaign.settings;

            // Get campaign settings
            const [settings] = await this.mysqlPool.execute(
                'SELECT * FROM campaign_settings WHERE campaign_id = ?',
                [campaignId]
            );
            const rawCampaignSettings = settings[0] || {};
            const campaignSettings = {
                ...rawCampaignSettings,
                call_interval_seconds:
                    rawCampaignSettings.call_interval_seconds ?? 10,
                retry_interval_seconds:
                    rawCampaignSettings.retry_interval_seconds ?? 300
            };

            const maxRetryAttempts = campaign.max_retry_attempts ?? 0;

            // Get concurrent calls limit (default to 2 if not set)
            const concurrentCallsLimit = campaign.concurrent_calls || 2;
            console.log(`🔢 Concurrent calls limit: ${concurrentCallsLimit}`);

            // Get contacts that are pending or eligible for retry
            const [contacts] = await this.mysqlPool.execute(
                `SELECT * FROM campaign_contacts
         WHERE campaign_id = ? AND (status = 'pending' OR (status = 'failed' AND attempts < ? AND last_attempt_at < NOW() - INTERVAL ? SECOND))
         ORDER BY created_at ASC`,
                [campaignId, maxRetryAttempts, campaignSettings.retry_interval_seconds]
            );

            console.log(`📋 Found ${contacts.length} contacts to call (including retries)`);
            console.log(`⏱️ Call interval: ${campaignSettings.call_interval_seconds} seconds between batches`);

            if (contacts.length === 0) {
                console.log(`✅ No more contacts to process for campaign ${campaignId}. Completing.`);
                await this.completeCampaign(campaignId);
                return;
            }

            // Process contacts in batches based on concurrent calls limit
            for (let i = 0; i < contacts.length; i += concurrentCallsLimit) {
                // Check if campaign is still running
                const campaignState = this.activeCampaigns.get(campaignId);
                if (!campaignState || campaignState.status !== 'running') {
                    console.log(`⏸️ Campaign ${campaignId} paused or stopped`);
                    break;
                }

                // Get batch of contacts
                const batch = contacts.slice(i, i + concurrentCallsLimit);
                console.log(`\n📞 Processing batch ${Math.floor(i / concurrentCallsLimit) + 1}/${Math.ceil(contacts.length / concurrentCallsLimit)}: ${batch.length} concurrent calls`);

                // Check user balance before batch
                const balanceCheck = await this.walletService.checkBalanceForCall(userId, 0.10 * batch.length);
                if (!balanceCheck.allowed) {
                    console.error(`❌ Insufficient balance, pausing campaign ${campaignId}`);
                    await this.pauseCampaign(campaignId);
                    break;
                }

                // Make calls concurrently for this batch
                const callPromises = batch.map(contact => {
                    console.log(`🔄 Initiating call to ${contact.phone_number}...`);
                    return this.makeCall(campaignId, contact, campaign, agentSettings)
                        .catch(error => {
                            console.error(`Error calling ${contact.phone_number}:`, error);
                            // Mark contact as failed immediately if call initiation fails
                            this.mysqlPool.execute(
                                `UPDATE campaign_contacts
                                 SET status = 'failed', error_message = ?, completed_at = NOW()
                                 WHERE id = ?`,
                                [error.message, contact.id]
                            ).catch(err => console.error('Error updating contact status after call initiation failure:', err));
                            return { success: false, error: error.message };
                        });
                });

                // Wait for all calls in this batch to be initiated
                await Promise.all(callPromises);
                console.log(`✅ Batch ${Math.floor(i / concurrentCallsLimit) + 1} initiated`);

                // Wait between batches (prevents calling all numbers at once)
                if (i + concurrentCallsLimit < contacts.length) {
                    const waitTime = campaignSettings && campaignSettings.call_interval_seconds > 0
                        ? campaignSettings.call_interval_seconds
                        : 10; // Default 10 seconds

                    console.log(`⏳ Waiting ${waitTime} seconds before next batch...`);
                    await new Promise(resolve =>
                        setTimeout(resolve, waitTime * 1000)
                    );
                }
            }

            // After processing all current contacts, check if there are any pending retries
            await this.completeCampaign(campaignId);

        } catch (error) {
            console.error(`Error processing campaign ${campaignId}:`, error);
            await this.mysqlPool.execute(
                `UPDATE campaigns SET status = 'cancelled' WHERE id = ?`,
                [campaignId]
            );
        } finally {
            // Only delete from active campaigns if it's truly completed or cancelled, not just paused
            const campaignState = this.activeCampaigns.get(campaignId);
            if (campaignState && (campaignState.status === 'completed' || campaignState.status === 'cancelled')) {
                this.activeCampaigns.delete(campaignId);
            }
        }
    }

    /**
     * Make a call to a contact
     */
    async makeCall(campaignId, contact, campaign, agentSettings) {
        try {
            console.log(`📞 Calling ${contact.phone_number} (${contact.name || 'Unknown'})`);

            // Update contact status to 'calling' and increment attempts
            await this.mysqlPool.execute(
                `UPDATE campaign_contacts
         SET status = 'calling', attempts = attempts + 1, last_attempt_at = NOW()
         WHERE id = ?`,
                [contact.id]
            );

            // Get Twilio credentials and phone number for this user/campaign
            let query = 'SELECT phone_number, twilio_account_sid, twilio_auth_token FROM user_twilio_numbers WHERE user_id = ?';
            let params = [campaign.user_id];

            // If campaign has a specific phone number assigned, use it
            if (campaign.phone_number_id) {
                query += ' AND id = ?';
                params.push(campaign.phone_number_id);
            } else {
                query += ' AND verified = TRUE LIMIT 1';
            }

            const [twilioNumbers] = await this.mysqlPool.execute(query, params);

            if (twilioNumbers.length === 0) {
                throw new Error('No active/verified Twilio number found for this user');
            }

            const twilioInfo = twilioNumbers[0];
            const fromNumber = twilioInfo.phone_number;
            const accountSid = twilioInfo.twilio_account_sid;
            const encryptedAuthToken = twilioInfo.twilio_auth_token;

            // calls.phone_number_id references phone_numbers.id, but campaigns currently
            // store the selected caller using the Twilio-number selection flow.
            // Resolve the matching phone_numbers row here so we don't disturb existing UI/state.
            const [phoneNumberRows] = await this.mysqlPool.execute(
                `SELECT id
                 FROM phone_numbers
                 WHERE user_id = ? AND phone_number = ?
                 LIMIT 1`,
                [campaign.user_id, fromNumber]
            );
            const resolvedPhoneNumberId = phoneNumberRows[0]?.id || null;

            if (!accountSid || !encryptedAuthToken) {
                throw new Error('Twilio credentials (SID/Token) missing in database for this number');
            }

            // Decrypt the auth token
            let authToken;
            try {
                authToken = decrypt(encryptedAuthToken);
            } catch (decryptErr) {
                console.error('Decryption failed for Twilio token:', decryptErr.message);
                throw new Error('Failed to decrypt Twilio auth token from database');
            }

            // Create a specific Twilio client for this user/account
            const userTwilioClient = twilio(accountSid, authToken);

            // Create TwiML URL with campaign parameters
            const twimlUrl = `${buildBackendUrl('/twilio/voice')}?` +
                `agentId=${campaign.agent_id}&` +
                `userId=${campaign.user_id}&` +
                `campaignId=${campaignId}&` +
                `contactId=${contact.id}`;

            // Make the call using the user-specific client
            const call = await userTwilioClient.calls.create({
                from: fromNumber,
                to: contact.phone_number,
                url: twimlUrl,
                statusCallback: `${buildBackendUrl('/twilio/status')}?callId=${contact.id}`,
                statusCallbackEvent: ['completed'],
                statusCallbackMethod: 'POST',
                record: true,  // Enable recording for campaign calls
                recordingStatusCallback: `${buildBackendUrl('/twilio/recording-status')}?contactId=${contact.id}`,
                recordingStatusCallbackEvent: ['completed'],
                recordingStatusCallbackMethod: 'POST'
            });

            console.log(`✅ Call initiated: ${call.sid}`);

            // Create comprehensive call record for call history
            const callId = uuidv4();
            await this.mysqlPool.execute(
                `INSERT INTO calls (
                    id, user_id, agent_id, call_sid, from_number, to_number,
                    status, call_type, started_at, campaign_id, phone_number_id
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?)`,
                [
                    callId,
                    campaign.user_id,
                    campaign.agent_id,
                    call.sid,
                    fromNumber,
                    contact.phone_number,
                    'initiated',  // Initial status
                    'twilio_outbound',   // Must match ENUM: 'twilio_inbound', 'twilio_outbound', 'web_call'
                    campaignId,
                    resolvedPhoneNumberId
                ]
            );

            console.log(`📝 Call record created: ${callId} for contact ${contact.phone_number}`);

            // Update contact with call ID
            await this.mysqlPool.execute(
                'UPDATE campaign_contacts SET call_id = ?, status = \'calling\' WHERE id = ?',
                [callId, contact.id]
            );

            return { success: true, callSid: call.sid, callId };

        } catch (error) {
            console.error(`Error making call to ${contact.phone_number}:`, error);

            // Mark contact as failed
            await this.mysqlPool.execute(
                `UPDATE campaign_contacts
         SET status = 'failed', error_message = ?, completed_at = NOW()
         WHERE id = ?`,
                [error.message, contact.id]
            );

            // Update campaign failed calls count
            await this.mysqlPool.execute(
                'UPDATE campaigns SET failed_calls = failed_calls + 1 WHERE id = ?',
                [campaignId]
            );

            return { success: false, error: error.message };
        }
    }

    /**
     * Pause a campaign
     */
    async pauseCampaign(campaignId) {
        await this.mysqlPool.execute(
            `UPDATE campaigns SET status = 'paused' WHERE id = ?`,
            [campaignId]
        );

        const campaignState = this.activeCampaigns.get(campaignId);
        if (campaignState) {
            campaignState.status = 'paused';
        }
    }

    /**
     * Complete a campaign
     * Now checks for pending retries before marking as 'completed'.
     */
    async completeCampaign(campaignId) {
        // Check if there are any contacts still eligible for retry
        const [campaign] = await this.mysqlPool.execute(
            'SELECT max_retry_attempts FROM campaigns WHERE id = ?',
            [campaignId]
        );

        if (campaign.length === 0) {
            console.error(`Campaign ${campaignId} not found during completion check.`);
            return;
        }

        const [contactsToRetry] = await this.mysqlPool.execute(
            `SELECT id FROM campaign_contacts
       WHERE campaign_id = ? AND status = 'failed' AND attempts < ?`,
            [campaignId, campaign[0].max_retry_attempts]
        );

        if (contactsToRetry.length > 0) {
            // If there are contacts to retry, update campaign status to 'retrying'
            await this.mysqlPool.execute(
                `UPDATE campaigns SET status = 'retrying' WHERE id = ?`,
                [campaignId]
            );
            console.log(`🔄 Campaign ${campaignId} has contacts pending retry. Status set to 'retrying'.`);
            // Keep it in activeCampaigns if it's retrying, so processCampaign can pick it up again
            this.activeCampaigns.set(campaignId, { status: 'retrying' });
        } else {
            // No more contacts to retry, mark as completed
            await this.mysqlPool.execute(
                `UPDATE campaigns SET status = 'completed', completed_at = NOW() WHERE id = ?`,
                [campaignId]
            );
            console.log(`✅ Campaign ${campaignId} completed`);
            this.activeCampaigns.delete(campaignId); // Remove from active campaigns
        }
    }

    /**
     * Get campaign details
     */
    async getCampaign(campaignId) {
        const [campaigns] = await this.mysqlPool.execute(
            `SELECT c.*, a.name as agent_name
       FROM campaigns c
       LEFT JOIN agents a ON c.agent_id = a.id
       WHERE c.id = ?`,
            [campaignId]
        );

        if (campaigns.length === 0) {
            throw new Error('Campaign not found');
        }

        return campaigns[0];
    }

    /**
     * Get campaign details with contact records
     */
    async getCampaignWithRecords(campaignId, userId) {
        // Get campaign details
        const [campaigns] = await this.mysqlPool.execute(
            `SELECT c.*, a.name as agent_name
       FROM campaigns c
       LEFT JOIN agents a ON c.agent_id = a.id
       WHERE c.id = ? AND c.user_id = ?`,
            [campaignId, userId]
        );

        if (campaigns.length === 0) {
            return null;
        }

        const campaign = campaigns[0];

        // Get campaign contacts/records
        const [records] = await this.mysqlPool.execute(
            `SELECT * FROM campaign_contacts
       WHERE campaign_id = ?
       ORDER BY created_at DESC`,
            [campaignId]
        );

        // Map database fields to frontend-expected fields
        const mappedRecords = records.map(record => ({
            ...record,
            phone: record.phone_number,  // Map phone_number to phone
            callStatus: record.status     // Map status to callStatus
        }));

        return {
            campaign,
            records: mappedRecords
        };
    }

    /**
     * Get all campaigns for a user
     */
    async getUserCampaigns(userId, companyId = null) {
        let query = `SELECT c.*, a.name as agent_name
       FROM campaigns c
       LEFT JOIN agents a ON c.agent_id = a.id
       WHERE c.user_id = ?`;
        const params = [userId];

        if (companyId) {
            query += ' AND c.company_id = ?';
            params.push(companyId);
        } else {
            // Fetch user's current company ID
            const [user] = await this.mysqlPool.execute('SELECT current_company_id FROM users WHERE id = ?', [userId]);
            if (user.length > 0 && user[0].current_company_id) {
                query += ' AND c.company_id = ?';
                params.push(user[0].current_company_id);
            } else {
                query += ' AND (c.company_id IS NULL OR c.company_id = "")';
            }
        }

        query += ' ORDER BY c.created_at DESC';
        const [campaigns] = await this.mysqlPool.execute(query, params);
        return campaigns;
    }

    /**
     * Get campaign contacts
     */
    async getCampaignContacts(campaignId, status = null) {
        let query = 'SELECT * FROM campaign_contacts WHERE campaign_id = ?';
        const params = [campaignId];

        if (status) {
            query += ' AND status = ?';
            params.push(status);
        }

        query += ' ORDER BY created_at ASC';

        const [contacts] = await this.mysqlPool.execute(query, params);
        return contacts;
    }

    /**
     * Update campaign contact after call completion
     * Now includes LLM intent classification.
     */
    async updateContactAfterCall(contactId, callDuration, callCost, status = 'completed', transcript = null, recordingUrl = null) {
        let llmClassification = null;
        let scheduleTime = null;

        if (transcript && this.llmService) {
            try {
                const llmResponse = await this.classifyIntent(transcript);
                llmClassification = llmResponse.intent;
                scheduleTime = llmResponse.schedule_time;
                console.log(`LLM Classification for contact ${contactId}: ${llmClassification}, Schedule: ${scheduleTime}`);
            } catch (llmError) {
                console.error(`Error classifying intent for contact ${contactId}:`, llmError);
            }
        }

        let meetLink = null;
        let emailSentAt = null;
        if ((llmClassification === 'scheduled_meeting' || llmClassification === 'needs_demo' || llmClassification === '1_on_1_session_requested') && scheduleTime) {
            try {
                const [contactRows] = await this.mysqlPool.execute(
                    'SELECT email, name, campaign_id FROM campaign_contacts WHERE id = ?', [contactId]
                );
                if (contactRows.length > 0 && contactRows[0].email) {
                    const contactInfo = contactRows[0];
                    const [campRows] = await this.mysqlPool.execute(
                        'SELECT a.name as agent_name FROM campaigns c JOIN agents a ON c.agent_id = a.id WHERE c.id = ?',
                        [contactInfo.campaign_id]
                    );
                    const agentName = campRows.length > 0 ? campRows[0].agent_name : 'Ziya Voice Agent';

                    meetLink = emailService.generateMeetLink();
                    const emailSent = await emailService.sendMeetingInvite(
                        contactInfo.email,
                        contactInfo.name,
                        agentName,
                        scheduleTime,
                        meetLink
                    );
                    
                    // ✅ CRITICAL FIX: Only mark as sent if email was actually sent successfully
                    if (emailSent) {
                        emailSentAt = new Date().toISOString();
                        console.log(`✅ Meeting email CONFIRMED sent to ${contactInfo.email} with link: ${meetLink}`);
                    } else {
                        console.error(`❌ CRITICAL: Meeting email FAILED to send to ${contactInfo.email}. Customer will not receive meeting details. Link: ${meetLink}`);
                        meetLink = null; // Don't store link if email failed
                    }
                } else {
                    console.warn(`⚠️ No email found for contact ${contactId}. Cannot send meeting invite.`);
                }
            } catch (e) {
                console.error('❌ CRITICAL Error during meeting scheduling:', e.message);
                console.error('   Contact will not receive meeting invite. Intent will be marked but meeting link cleared.');
                meetLink = null; // Clear link on any error
            }
        }

        await this.mysqlPool.execute(
            `UPDATE campaign_contacts
       SET status = ?, call_duration = ?, call_cost = ?, completed_at = NOW(), intent = ?, schedule_time = IFNULL(?, schedule_time), transcript = ?, meet_link = ?, email_sent_at = ?
       WHERE id = ?`,
            [status, callDuration, callCost, llmClassification || null, scheduleTime || null, transcript || null, meetLink || null, emailSentAt || null, contactId]
        );

        // Get contact and campaign details for Google Sheets logging and Webhooks
        const [contacts] = await this.mysqlPool.execute(
            `SELECT cc.*, c.name as campaign_name, c.user_id, c.agent_id, c.max_retry_attempts, a.settings as agent_settings
             FROM campaign_contacts cc
             JOIN campaigns c ON cc.campaign_id = c.id
             LEFT JOIN agents a ON c.agent_id = a.id
             WHERE cc.id = ?`,
            [contactId]
        );

        if (contacts.length > 0) {
            const contact = contacts[0];
            const campaignId = contact.campaign_id;

            // Determine if this contact needs a retry
            const needsRetry = status === 'failed' && (contact.attempts || 0) < (contact.max_retry_attempts ?? 0);

            // Update campaign stats
            await this.mysqlPool.execute(
                `UPDATE campaigns SET
         completed_calls = completed_calls + 1,
         successful_calls = successful_calls + IF(? = 'completed', 1, 0),
         failed_calls = failed_calls + IF(? = 'failed' AND ? = 0, 1, 0), -- Only count as failed if no more retries
         total_cost = total_cost + ?
         WHERE id = ?`,
                [status, status, needsRetry ? 0 : 1, callCost, campaignId]
            );

            // If it needs retry, update campaign status to 'retrying'
            if (needsRetry) {
                await this.mysqlPool.execute(
                    `UPDATE campaigns SET status = 'retrying' WHERE id = ? AND status != 'running'`,
                    [campaignId]
                );
                this.activeCampaigns.set(campaignId, { status: 'retrying' });
            } else {
                // If no retry, check if campaign is truly completed
                await this.completeCampaign(campaignId);
            }

            // Log to Google Sheets if configured (passing intent string)
            try {
                await this.logToGoogleSheets(contact, callDuration, callCost, status, recordingUrl, llmClassification);
            } catch (error) {
                console.error('Failed to log to Google Sheets:', error.message);
                // Don't fail the whole operation if Google Sheets logging fails
            }

            // Send webhook if configured via agent settings
            if (contact.agent_settings) {
                try {
                    const settingsObj = typeof contact.agent_settings === 'string' ? JSON.parse(contact.agent_settings) : contact.agent_settings;

                    if (settingsObj.webhookEnabled && settingsObj.webhookUrl) {
                        const payload = {
                            event: "call.completed",
                            timestamp: new Date().toISOString(),
                            contact: {
                                id: contact.id,
                                name: contact.name,
                                phone: contact.phone_number,
                                email: contact.email,
                            },
                            campaign: {
                                id: contact.campaign_id,
                                name: contact.campaign_name,
                            },
                            call: {
                                id: contact.call_id,
                                status: status,
                                duration_seconds: callDuration,
                                cost_usd: callCost,
                                outcome: llmClassification,
                                transcript: transcript,
                                recording_url: recordingUrl,
                                meet_link: meetLink,
                                schedule_time: scheduleTime,
                            }
                        };

                        const headers = { 'Content-Type': 'application/json' };

                        if (settingsObj.webhookSecret) {
                            const stringPayload = JSON.stringify(payload);
                            const signature = crypto.createHmac('sha256', settingsObj.webhookSecret).update(stringPayload).digest('hex');
                            headers['x-ziya-signature'] = signature;
                        }

                        axios.post(settingsObj.webhookUrl, payload, { headers, timeout: 5000 }).catch(e => {
                            console.error(`Failed to push webhook to ${settingsObj.webhookUrl}:`, e.message);
                        });
                        console.log(`✅ Dispatched webhook for call completion to ${settingsObj.webhookUrl}`);
                    }
                } catch (e) {
                    console.error('Failed to parse agent_settings for webhook or send webhook:', e.message);
                }
            }
        }
    }

    /**
     * Update contact status in real-time (called from Twilio webhook)
     */
    async updateContactStatus(contactId, status, duration = null, callSid = null) {
        try {
            console.log(`🔄 Updating lead ${contactId} status to: ${status}`);

            // Map Twilio status to our internal lead status
            let mappedStatus = 'pending';
            const s = status.toLowerCase();

            if (s === 'in-progress' || s === 'ringing' || s === 'calling') {
                mappedStatus = 'calling';
            } else if (s === 'completed') {
                mappedStatus = 'completed';
            } else if (s === 'failed' || s === 'no-answer' || s === 'busy' || s === 'canceled') {
                mappedStatus = 'failed';
            }

            const [result] = await this.mysqlPool.execute(
                `UPDATE campaign_contacts
                 SET status = ?, 
                     call_duration = IFNULL(?, call_duration), 
                     call_id = IFNULL(?, call_id),
                     updated_at = NOW()
                 WHERE id = ?`,
                [mappedStatus, duration, callSid, contactId]
            );

            if (result.affectedRows === 0) {
                console.warn(`⚠️ No lead found to update with ID: ${contactId}`);
                return false;
            }

            // If call completed or failed, we might want to check campaign completion
            if (mappedStatus === 'completed' || mappedStatus === 'failed') {
                // Get campaign ID for this contact
                const [contacts] = await this.mysqlPool.execute(
                    'SELECT campaign_id FROM campaign_contacts WHERE id = ?',
                    [contactId]
                );
                if (contacts.length > 0) {
                    const campaignId = contacts[0].campaign_id;
                    await this.completeCampaign(campaignId);
                }
            }

            return true;
        } catch (error) {
            console.error('Error updating contact status:', error);
            throw error;
        }
    }


    async classifyIntent(transcript) {
        if (!this.llmService) {
            console.warn('⚠️ LLMService not initialized. Cannot classify intent. Returning unknown.');
            return { intent: null, schedule_time: null };
        }

        const prompt = `Analyze the following call transcript and classify the user's intent.
        The intent MUST be one of the following exact strings: "interested", "not_interested", "needs_demo", "scheduled_meeting", or "1_on_1_session_requested".
        If the intent is "needs_demo", "scheduled_meeting", or "1_on_1_session_requested", try to extract the agreed schedule date and time from the transcript. If a time is found, format it as an ISO 8601 string (e.g. 2026-05-20T14:30:00Z). If no exact time is found, return null. Assume current year is 2026.

        IMPORTANT: ALWAYS return ONLY a valid JSON object matching this schema. Do not include any markdown formatting like \`\`\`json.
        {
          "intent": "interested" | "not_interested" | "needs_demo" | "scheduled_meeting" | "1_on_1_session_requested" | "unknown",
          "schedule_time": "ISO-8601 date string" | null
        }
        
        Transcript: "${transcript}"`;

        try {
            // Use LLMService's generateContent method which handles both Gemini and OpenAI
            const result = await this.llmService.generateContent({
                model: 'gemini-2.0-flash',
                contents: [{ role: 'user', parts: [{ text: prompt }] }]
            });
            
            let cleanedResult = result.trim();
            if (cleanedResult.startsWith('\`\`\`json')) {
                cleanedResult = cleanedResult.substring(7);
            }
            if (cleanedResult.startsWith('\`\`\`')) {
                cleanedResult = cleanedResult.substring(3);
            }
            if (cleanedResult.endsWith('\`\`\`')) {
                cleanedResult = cleanedResult.substring(0, cleanedResult.length - 3);
            }
            
            const parsed = JSON.parse(cleanedResult.trim());
            console.log(`✅ Intent classification result: ${parsed.intent}, Schedule: ${parsed.schedule_time}`);
            return parsed;
        } catch (error) {
            console.error('❌ Error classifying intent with LLM:', error);
            return { intent: 'unknown', schedule_time: null };
        }
    }

    async logToGoogleSheets(contact, callDuration, callCost, status, recordingUrl, llmClassification) {
        try {
            // Get agent settings to find Google Sheets URL
            const [agents] = await this.mysqlPool.execute(
                'SELECT settings FROM agents WHERE id = ?',
                [contact.agent_id]
            );

            if (agents.length === 0) {
                console.log('No agent found for Google Sheets logging');
                return;
            }

            const agentSettings = typeof agents[0].settings === 'string'
                ? JSON.parse(agents[0].settings)
                : agents[0].settings;

            const googleSheetsUrl = agentSettings?.googleSheetsUrl || agentSettings?.google_sheets_url;

            if (!googleSheetsUrl) {
                console.log('No Google Sheets URL configured for this agent');
                return;
            }

            // Extract spreadsheet ID from URL
            const spreadsheetIdMatch = googleSheetsUrl.match(/\/d\/([a-zA-Z0-9-_]+)/);
            if (!spreadsheetIdMatch) {
                console.error('Invalid Google Sheets URL format');
                return;
            }

            const spreadsheetId = spreadsheetIdMatch[1];

            // Prepare data row
            const timestamp = new Date().toISOString();
            const rowData = [
                timestamp,
                contact.campaign_name || 'N/A',
                contact.name || 'Unknown',
                contact.phone_number,
                contact.email || '', // New: email
                status,
                llmClassification || '', // New: LLM Classification
                callDuration || 0,
                callCost || 0,
                recordingUrl || '',  // Add recording URL
                contact.metadata ? JSON.stringify(contact.metadata) : ''
            ];

            // Use Google Sheets API with credentials from environment
            const { google } = require('googleapis');

            let auth;
            if (process.env.GOOGLE_CREDENTIALS_BASE64) {
                // Railway/Production: Use base64 encoded credentials
                const credentials = JSON.parse(
                    Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString('utf-8')
                );
                auth = new google.auth.GoogleAuth({
                    credentials: credentials,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
            } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
                // Local: Use credentials file
                auth = new google.auth.GoogleAuth({
                    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
                    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
                });
            } else {
                console.error('No Google credentials configured');
                return;
            }

            const sheets = google.sheets({ version: 'v4', auth });

            // Append row to sheet (Updated range to include new columns)
            await sheets.spreadsheets.values.append({
                spreadsheetId: spreadsheetId,
                range: 'Sheet1!A:K', // Updated to include email and LLM classification
                valueInputOption: 'USER_ENTERED',
                resource: {
                    values: [rowData]
                }
            });

            console.log(`✅ Logged call to Google Sheets: ${contact.phone_number}`);
        } catch (error) {
            console.error('Error logging to Google Sheets:', error.message);
            throw error;
        }
    }
    /**
     * Set caller phone and agent for a campaign
     */
    async setCallerPhone(campaignId, userId, phoneNumberId, agentId) {
        try {
            await this.mysqlPool.execute(
                `UPDATE campaigns SET phone_number_id = ?, agent_id = ? WHERE id = ? AND user_id = ?`,
                [phoneNumberId, agentId, campaignId, userId]
            );
            return this.getCampaign(campaignId);
        } catch (error) {
            console.error('Error setting caller phone:', error);
            throw error;
        }
    }

    /**
     * Update campaign settings (e.g., retry interval, LLM prompt)
     */
    async updateCampaignSettings(campaignId, userId, settingsData) {
        try {
            // First, verify campaign belongs to user
            const [campaigns] = await this.mysqlPool.execute(
                'SELECT id FROM campaigns WHERE id = ? AND user_id = ?',
                [campaignId, userId]
            );

            if (campaigns.length === 0) {
                throw new Error('Campaign not found or access denied');
            }

            const updates = [];
            const values = [];

            if (settingsData.call_interval_seconds !== undefined) {
                updates.push('call_interval_seconds = ?');
                values.push(settingsData.call_interval_seconds);
            }
            if (settingsData.retry_interval_seconds !== undefined) {
                updates.push('retry_interval_seconds = ?');
                values.push(settingsData.retry_interval_seconds);
            }
            if (settingsData.llm_prompt !== undefined) {
                updates.push('llm_prompt = ?');
                values.push(settingsData.llm_prompt);
            }
            if (settingsData.llm_model !== undefined) {
                updates.push('llm_model = ?');
                values.push(settingsData.llm_model);
            }

            if (updates.length === 0) {
                return this.getCampaignSettings(campaignId); // No updates, return current settings
            }

            values.push(campaignId);

            await this.mysqlPool.execute(
                `UPDATE campaign_settings SET ${updates.join(', ')} WHERE campaign_id = ?`,
                values
            );

            return this.getCampaignSettings(campaignId);
        } catch (error) {
            console.error('Error updating campaign settings:', error);
            throw error;
        }
    }

    /**
     * Get campaign settings
     */
    async getCampaignSettings(campaignId) {
        const [settings] = await this.mysqlPool.execute(
            'SELECT * FROM campaign_settings WHERE campaign_id = ?',
            [campaignId]
        );
        return settings[0] || null;
    }

    /**
     * Delete a campaign
     */
    async deleteCampaign(campaignId, userId) {
        try {
            // Verify campaign belongs to user before deleting
            const [campaigns] = await this.mysqlPool.execute(
                'SELECT id FROM campaigns WHERE id = ? AND user_id = ?',
                [campaignId, userId]
            );

            if (campaigns.length === 0) {
                throw new Error('Campaign not found or access denied');
            }

            // Delete campaign (cascade will handle contacts and settings)
            await this.mysqlPool.execute(
                'DELETE FROM campaigns WHERE id = ? AND user_id = ?',
                [campaignId, userId]
            );

            // Remove from active campaigns if it was running
            this.activeCampaigns.delete(campaignId);

            return { success: true, message: 'Campaign deleted successfully' };
        } catch (error) {
            console.error('Error deleting campaign:', error);
            throw error;
        }
    }

    /**
     * Delete a record/contact from a campaign
     */
    async deleteRecord(recordId, campaignId, userId) {
        try {
            // Verify the campaign belongs to the user
            const [campaigns] = await this.mysqlPool.execute(
                'SELECT id FROM campaigns WHERE id = ? AND user_id = ?',
                [campaignId, userId]
            );

            if (campaigns.length === 0) {
                throw new Error('Campaign not found or access denied');
            }

            // Delete the contact record
            const [result] = await this.mysqlPool.execute(
                'DELETE FROM campaign_contacts WHERE id = ? AND campaign_id = ?',
                [recordId, campaignId]
            );

            if (result.affectedRows === 0) {
                return null; // Record not found
            }

            // Update total contacts count
            await this.mysqlPool.execute(
                `UPDATE campaigns SET total_contacts = (
          SELECT COUNT(*) FROM campaign_contacts WHERE campaign_id = ?
        ) WHERE id = ?`,
                [campaignId, campaignId]
            );

            return { success: true, message: 'Record deleted successfully' };
        } catch (error) {
            console.error('Error deleting record:', error);
            throw error;
        }
    }

    /**
     * Update a campaign
     */
    async updateCampaign(campaignId, userId, campaignData) {
        try {
            const updates = [];
            const values = [];

            if (campaignData.name !== undefined) {
                updates.push('name = ?');
                values.push(campaignData.name);
            }
            if (campaignData.description !== undefined) {
                updates.push('description = ?');
                values.push(campaignData.description);
            }
            if (campaignData.agent_id !== undefined) {
                updates.push('agent_id = ?');
                values.push(campaignData.agent_id === '' ? null : campaignData.agent_id);
            }
            if (campaignData.phone_number_id !== undefined) {
                updates.push('phone_number_id = ?');
                values.push(campaignData.phone_number_id === '' ? null : campaignData.phone_number_id);
            }
            if (campaignData.concurrent_calls !== undefined) {
                updates.push('concurrent_calls = ?');
                values.push(campaignData.concurrent_calls);
            }
            if (campaignData.max_retry_attempts !== undefined) { // Updated from retry_attempts
                updates.push('max_retry_attempts = ?');
                values.push(campaignData.max_retry_attempts);
            }

            if (updates.length === 0) {
                // If no fields to update, return current campaign without error
                return this.getCampaign(campaignId);
            }

            values.push(campaignId, userId);

            await this.mysqlPool.execute(
                `UPDATE campaigns SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`,
                values
            );

            return this.getCampaign(campaignId);
        } catch (error) {
            console.error('Error updating campaign:', error);
            throw error;
        }
    }

    /**
     * Stop/pause a campaign
     */
    async stopCampaign(campaignId, userId) {
        try {
            await this.mysqlPool.execute(
                `UPDATE campaigns SET status = 'paused' WHERE id = ? AND user_id = ?`,
                [campaignId, userId]
            );

            // Update in-memory state
            const campaignState = this.activeCampaigns.get(campaignId);
            if (campaignState) {
                campaignState.status = 'paused';
            }

            return { success: true, message: 'Campaign paused' };
        } catch (error) {
            console.error('Error stopping campaign:', error);
            throw error;
        }
    }
}


module.exports = CampaignService;
