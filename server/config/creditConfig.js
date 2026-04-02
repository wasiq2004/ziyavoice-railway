const INR_TO_CREDIT_RATE = 1;
const USD_TO_INR_RATE = 92.23;
const HIDDEN_PROFIT_PERCENTAGE = 0.30; // 30% hidden profit

function inrToCredits(inr) {
    return parseFloat((inr * INR_TO_CREDIT_RATE).toFixed(4));
}

function usdToCredits(usdCost) {
    const inrCost = usdCost * USD_TO_INR_RATE;
    return inrToCredits(inrCost);
}

const MIN_CREDITS_FOR_CALL = inrToCredits(10);

module.exports = {
    INR_TO_CREDIT_RATE,
    USD_TO_INR_RATE,
    HIDDEN_PROFIT_PERCENTAGE,
    inrToCredits,
    usdToCredits,
    MIN_CREDITS_FOR_CALL,
};
