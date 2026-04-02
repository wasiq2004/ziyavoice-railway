const { v4: uuidv4 } = require("uuid");

class AgentService {
    constructor(pool) {
        this.pool = pool;
    }

    // Get all agents
    async getAgents(userId, companyId = null) {
        try {
            let query = `
                SELECT a.*,
                    (SELECT COUNT(*) FROM phone_numbers pn WHERE pn.agent_id = a.id LIMIT 1) AS phone_count,
                    (SELECT COUNT(*) FROM user_twilio_numbers utn WHERE utn.agent_id = a.id LIMIT 1) AS twilio_phone_count
                FROM agents a
                WHERE a.user_id = ?`;
            let params = [userId];

            if (companyId) {
                // Show agents belonging to the company OR agents belonging to the user with no company
                query += ' AND (a.company_id = ? OR a.company_id IS NULL OR a.company_id = "")';
                params.push(companyId);
            } else {
                // Fetch user's current company ID if none provided
                const [user] = await this.pool.execute('SELECT current_company_id FROM users WHERE id = ?', [userId]);
                if (user.length > 0 && user[0].current_company_id) {
                    query += ' AND (a.company_id = ? OR a.company_id IS NULL OR a.company_id = "")';
                    params.push(user[0].current_company_id);
                }
                // If user has no current company, we don't add additional filters by default
                // letting them see all their agents (mostly NULL company_id ones)
            }

            query += ' ORDER BY a.created_at DESC';
            const [rows] = await this.pool.execute(query, params);

            return rows.map(agent => ({
                id: agent.id,
                user_id: agent.user_id,
                name: agent.name || 'Unnamed Agent',
                identity: agent.identity || '',
                createdDate: agent.created_at,
                status: agent.status || 'Inactive',
                model: agent.model || 'gpt-4',
                voiceId: agent.voice_id || 'eleven-rachel',
                language: agent.language || 'en-US',
                settings: agent.settings ? this.parseJsonSafely(agent.settings) : this.getDefaultSettings(),
                updatedDate: agent.updated_at || agent.created_at,
                hasPhoneNumber: (parseInt(agent.phone_count || 0) + parseInt(agent.twilio_phone_count || 0)) > 0
            }));
        } catch (err) {
            console.error("Error fetching agents:", err);
            throw new Error("Failed to fetch agents");
        }
    }

    // Get a single agent
    async getAgentById(userId, id) {
        try {
            const [rows] = await this.pool.execute(
                `SELECT * FROM agents WHERE user_id = ? AND id = ?`,
                [userId, id]
            );

            if (rows.length === 0) return null;

            const agent = rows[0];

            return {
                id: agent.id,
                user_id: agent.user_id,
                name: agent.name || 'Unnamed Agent',
                identity: agent.identity || '',
                createdDate: agent.created_at,
                status: agent.status || 'Inactive',
                model: agent.model || 'gpt-4',
                voiceId: agent.voice_id || 'eleven-rachel',
                language: agent.language || 'en-US',
                settings: agent.settings ? this.parseJsonSafely(agent.settings) : this.getDefaultSettings(),
                updatedDate: agent.updated_at || agent.created_at
            };
        } catch (err) {
            console.error("Error fetching agent:", err);
            throw new Error("Failed to fetch agent");
        }
    }

    // Create agent
    async createAgent(userId, data) {
        try {
            const id = uuidv4();
            const createdAt = new Date().toISOString().slice(0, 19).replace("T", " ");

            const settingsJson = data.settings
                ? JSON.stringify(data.settings)
                : JSON.stringify(this.getDefaultSettings());

            // Fetch user's current company ID if none provided in data
            let companyId = data.companyId;
            if (!companyId) {
                const [user] = await this.pool.execute('SELECT current_company_id FROM users WHERE id = ?', [userId]);
                if (user.length > 0) {
                    companyId = user[0].current_company_id;
                }
            }

            await this.pool.execute(
                `
                INSERT INTO agents (id, user_id, name, identity, status, model, voice_id, language, settings, created_at, company_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `,
                [
                    id,
                    userId,
                    data.name,
                    data.identity,
                    data.status,
                    data.model,
                    data.voiceId,
                    data.language,
                    settingsJson,
                    createdAt,
                    companyId
                ]
            );

            return {
                id,
                name: data.name,
                identity: data.identity,
                createdDate: createdAt,
                status: data.status,
                model: data.model,
                voiceId: data.voiceId,
                language: data.language,
                settings: this.parseJsonSafely(settingsJson),
                updatedDate: createdAt
            };
        } catch (err) {
            console.error("Error creating agent:", err);
            throw new Error("Failed to create agent: " + err.message);
        }
    }

    // Update agent
    async updateAgent(userId, id, updateData) {
        try {
            const existing = await this.getAgentById(userId, id);
            if (!existing) throw new Error("Agent not found");

            const fields = [];
            const values = [];

            // Whitelist of fields to ensure secure and correct updates
            const fieldMap = {
                name: "name",
                identity: "identity",
                status: "status",
                model: "model",
                voiceId: "voice_id",
                language: "language",
                settings: "settings"
            };

            for (const key in updateData) {
                // Skip fields that are not in the whitelist (e.g. createdDate, updatedDate, unknown props)
                if (!fieldMap[key]) continue;

                const dbColumn = fieldMap[key];

                if (key === "settings") {
                    fields.push(`${dbColumn} = ?`);
                    values.push(JSON.stringify(updateData[key]));
                } else {
                    fields.push(`${dbColumn} = ?`);
                    values.push(updateData[key]);
                }
            }

            // Always update using ID and UserID for safety
            values.push(id);
            values.push(userId);

            if (fields.length > 0) {
                await this.pool.execute(
                    `UPDATE agents SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`,
                    values
                );
            }

            return await this.getAgentById(userId, id);
        } catch (err) {
            console.error("Error updating agent:", err);
            throw new Error("Failed to update agent: " + err.message);
        }
    }


    // Delete agent
    async deleteAgent(userId, id) {
        try {
            const existing = await this.getAgentById(userId, id);
            if (!existing) throw new Error("Agent not found");

            await this.pool.execute(
                `DELETE FROM agents WHERE id = ? AND user_id = ?`,
                [id, userId]
            );
        } catch (err) {
            console.error("Error deleting agent:", err);
            throw new Error("Failed to delete agent");
        }
    }

    parseJsonSafely(json) {
        try {
            return typeof json === "string" ? JSON.parse(json) : json;
        } catch (err) {
            return null;
        }
    }

    getDefaultSettings() {
        return {
            userStartsFirst: false,
            greetingLine: "Welcome! How can I help you?",
            responseDelay: false,
            inactivityHandling: true,
            agentCanTerminateCall: false,
            voicemailDetection: true,
            callTransfer: true,
            dtmfDial: false,
            agentTimezone: "America/New_York",
            voiceDetectionConfidenceThreshold: 0.5,
            overrideVAD: false,
            backgroundAmbientSound: "None",
            callRecording: true,
            sessionTimeoutFixedDuration: 3600,
            sessionTimeoutNoVoiceActivity: 300,
            sessionTimeoutEndMessage: "Your session has ended.",
            dataPrivacyOptOut: false,
            doNotCallDetection: true,
            prefetchDataWebhook: "",
            endOfCallWebhook: "",
            preActionPhrases: [],
            tools: []
        };
    }
}

module.exports = AgentService;
