const { v4: uuidv4 } = require('uuid');
const { usdToCredits, HIDDEN_PROFIT_PERCENTAGE } = require('../config/creditConfig');

class CostCalculator {
    constructor(mysqlPool, walletService) {
        this.mysqlPool = mysqlPool;
        this.walletService = walletService;
        this.pricingCache = new Map();
        this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
        this.lastCacheUpdate = 0;
    }

    /**
     * Get pricing for all services (with caching)
     */
    async getPricing() {
        const now = Date.now();
        if (now - this.lastCacheUpdate > this.cacheExpiry) {
            const [pricing] = await this.mysqlPool.execute(
                'SELECT * FROM service_pricing'
            );

            this.pricingCache.clear();
            pricing.forEach(p => {
                this.pricingCache.set(p.service_type, {
                    costPerUnit: parseFloat(p.cost_per_unit),
                    unitType: p.unit_type
                });
            });

            this.lastCacheUpdate = now;
        }

        return this.pricingCache;
    }

    async calculateServiceCost(serviceType, unitsUsed) {
        await this.getPricing();

        const pricing = this.pricingCache.get(serviceType);
        if (!pricing) {
            console.warn(`No pricing found for service: ${serviceType}`);
            return 0;
        }

        // costPerUnit stored in DB is in USD — convert to Credits
        const usdCost = pricing.costPerUnit * parseFloat(unitsUsed);
        const creditCost = usdToCredits(usdCost);
        return parseFloat(creditCost.toFixed(6));
    }

    async calculateCallCost(usage) {
        const costs = {};
        let totalCost = 0;

        for (const [service, units] of Object.entries(usage)) {
            if (units > 0) {
                const cost = await this.calculateServiceCost(service, units);
                costs[service] = {
                    units: parseFloat(units),
                    cost: cost
                };
                totalCost += cost;
            }
        }

        return {
            breakdown: costs,
            totalCost: parseFloat(totalCost.toFixed(4))
        };
    }

    async estimateElevenLabsCost(text) {
        const characters = text.length;
        return await this.calculateServiceCost('elevenlabs', characters);
    }

    async estimateSarvamCost(text) {
        const characters = text.length;
        return await this.calculateServiceCost('sarvam', characters);
    }

    async estimateDeepgramCost(durationSeconds) {
        return await this.calculateServiceCost('deepgram', durationSeconds);
    }

    async estimateGeminiCost(tokens) {
        return await this.calculateServiceCost('gemini', tokens);
    }


    async estimateTwilioCost(durationSeconds) {
        const minutes = durationSeconds / 60;
        return await this.calculateServiceCost('twilio', minutes);
    }


    async checkSufficientBalance(userId, estimatedCost) {
        try {
            const balance = await this.walletService.getBalance(userId);
            return balance >= estimatedCost;
        } catch (error) {
            console.error('Error checking balance:', error);
            return false;
        }
    }

    async recordAndCharge(userId, callId, usage, isVoiceCall = false, durationSeconds = 0) {
        try {
            const costBreakdown = await this.calculateCallCost(usage);

            // Hidden profit markup (30% of total usage cost)
            let hiddenMarkupCredits = 0;
            if (isVoiceCall) {
                hiddenMarkupCredits = costBreakdown.totalCost * (HIDDEN_PROFIT_PERCENTAGE || 0.30);
            }

            const totalCreditsToCharge = parseFloat((costBreakdown.totalCost + hiddenMarkupCredits).toFixed(4));

            // Check if user has sufficient balance
            const hasSufficientBalance = await this.checkSufficientBalance(
                userId,
                totalCreditsToCharge
            );

            if (!hasSufficientBalance) {
                throw new Error('Insufficient balance');
            }

            // Verify call exists if call_id is provided
            let validCallId = callId;
            if (callId) {
                try {
                    const [calls] = await this.mysqlPool.execute(
                        'SELECT id FROM calls WHERE id = ?',
                        [callId]
                    );
                    if (calls.length === 0) {
                        console.warn(`⚠️ Call ${callId} not found in database. Recording usage without call reference.`);
                        validCallId = null;
                    }
                } catch (err) {
                    console.error('Error checking call existence:', err);
                    validCallId = null;
                }
            }

            // Record each service usage (cost stored in Credits)
            const usageRecords = [];
            for (const [service, data] of Object.entries(costBreakdown.breakdown)) {
                const usageId = uuidv4();
                await this.mysqlPool.execute(
                    `INSERT INTO service_usage 
          (id, user_id, call_id, service_type, units_used, cost_per_unit, total_cost, metadata) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        usageId,
                        userId,
                        validCallId,
                        service,
                        data.units,
                        this.pricingCache.get(service) ? usdToCredits(this.pricingCache.get(service).costPerUnit) : 0,
                        data.cost,
                        JSON.stringify({
                            timestamp: new Date().toISOString(),
                            originalCallId: callId
                        })
                    ]
                );
                usageRecords.push({ service, ...data });
            }

            // Deduct total credits from wallet (includes hidden markup)
            const description = `Call ${callId ? callId.substring(0, 8) : 'N/A'} - Voice processing`;
            await this.walletService.deductCredits(
                userId,
                totalCreditsToCharge,
                null,
                description,
                validCallId,
                { breakdown: costBreakdown.breakdown }
            );

            return {
                success: true,
                totalCharged: totalCreditsToCharge,
                breakdown: costBreakdown.breakdown,
                usageRecords
            };
        } catch (error) {
            console.error('Error recording and charging:', error);
            throw error;
        }
    }

    async getCostSummary(userId, startDate, endDate) {
        try {
            const [results] = await this.mysqlPool.execute(
                `SELECT 
          service_type,
          SUM(units_used) as total_units,
          SUM(total_cost) as total_cost,
          COUNT(*) as usage_count
        FROM service_usage
        WHERE user_id = ? AND created_at BETWEEN ? AND ?
        GROUP BY service_type`,
                [userId, startDate, endDate]
            );

            const summary = {
                totalCost: 0,
                services: {}
            };

            results.forEach(row => {
                const cost = parseFloat(row.total_cost);
                summary.totalCost += cost;
                summary.services[row.service_type] = {
                    units: parseFloat(row.total_units),
                    cost: cost,
                    count: parseInt(row.usage_count)
                };
            });

            summary.totalCost = parseFloat(summary.totalCost.toFixed(4));

            return summary;
        } catch (error) {
            console.error('Error getting cost summary:', error);
            throw error;
        }
    }
}

module.exports = CostCalculator;
