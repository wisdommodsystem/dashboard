const axios = require('axios');

const sendWebhookLog = async (webhookUrl, title, color, fields, thumbnail, content = null) => {
    if (!webhookUrl) return; // If url is empty in .env, do nothing

    const embed = {
        title,
        color,
        fields,
        timestamp: new Date().toISOString()
    };
    
    if (thumbnail) {
        embed.thumbnail = { url: thumbnail };
    }

    try {
        await axios.post(webhookUrl, {
            username: 'Wisdom Security Logs',
            content: content || undefined,
            embeds: [embed]
        });
    } catch (err) {
        console.error('Failed to send webhook log:', err.message);
    }
};

module.exports = { sendWebhookLog };
