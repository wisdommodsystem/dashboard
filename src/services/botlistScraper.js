const axios = require('axios');
const cheerio = require('cheerio');

const scrapeServerInfo = async () => {
    try {
        const { data } = await axios.get('https://discordbotlist.com/servers/wisdom-circle-1201626435958354021', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const $ = cheerio.load(data);
        
        // Scraping logic for discordbotlist.com
        // Let's get generic things. Since classes might change, we look for standard elements or just return a default structure if scraping fails.
        const title = $('h1').first().text().trim() || 'Wisdom Circle ⭕';
        const description = $('p.lead').text().trim() || 'Community Server';
        
        let members = 'Unknown';
        // Usually there are stats blocks
        $('.stat').each((i, el) => {
            const text = $(el).text().toLowerCase();
            if (text.includes('members')) {
                members = $(el).find('.value, strong, h3').text().trim() || $(el).text().replace(/[^0-9]/g, '');
            }
        });
        
        // Fallback
        if (!members || members.length === 0) {
            const memberMatch = data.match(/([0-9,]+)\s+Members/i);
            if (memberMatch) members = memberMatch[1];
        }

        return {
            title,
            description,
            members: members || 'N/A'
        };
    } catch (err) {
        console.error('Scraping error:', err.message);
        return {
            title: 'Wisdom Circle ⭕',
            description: 'Wisdom Circle Management Dashboard',
            members: 'Loading...'
        };
    }
};

module.exports = { scrapeServerInfo };
