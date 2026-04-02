const fetch = require('node-fetch');
const FormData = require('form-data');

class SarvamSttService {
    constructor(apiKey) {
        if (!apiKey) throw new Error("Missing Sarvam API Key");
        this.apiKey = apiKey;
    }

    async transcribe(audioBuffer) {
        try {
            const formData = new FormData();
            formData.append('file', audioBuffer, {
                filename: 'audio.wav',
                contentType: 'audio/wav',
            });
            formData.append('model', 'saarika:v2.5');

            const response = await fetch('https://api.sarvam.ai/speech-to-text', {
                method: 'POST',
                headers: {
                    'api-subscription-key': this.apiKey,
                    ...formData.getHeaders()
                },
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Sarvam STT API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            return {
                transcript: data.transcript,
                language_code: data.language_code
            };
        } catch (error) {
            console.error('Sarvam STT Error:', error);
            throw error;
        }
    }
}

module.exports = SarvamSttService;
