// Nạp các thư viện
require('dotenv').config(); // Để đọc file .env
// THAY ĐỔI 1: Thêm 'Events' để sửa lỗi 'ready'
const { Client, GatewayIntentBits, EmbedBuilder, Events } = require('discord.js');
const Parser = require('rss-parser');

// THAY ĐỔI 2: Khởi tạo parser với User-Agent (để sửa lỗi 403)
const parser = new Parser({
    requestOptions: {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36'
        }
    }
});

// Lấy thông tin từ file .env
const TOKEN = process.env.DISCORD_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const RSS_FEED_URL = process.env.RSS_FEED_URL;
const CHECK_INTERVAL = parseInt(process.env.CHECK_INTERVAL_MS, 10) || 300000; // Mặc định 5 phút

// Biến để lưu ID của bài đăng cuối cùng, tránh đăng lặp
let lastPostGUID = null;

// Khởi tạo Discord Client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// THAY ĐỔI 3: Sử dụng 'Events.ClientReady' thay vì chuỗi 'ready'
client.on(Events.ClientReady, () => {
    console.log(`✅ Đã đăng nhập với tên ${client.user.tag}!`);
    console.log(`Bắt đầu theo dõi RSS Feed: ${RSS_FEED_URL}`);
    
    // Chạy hàm kiểm tra ngay khi bot sẵn sàng (để đăng bài đầu tiên)
    checkFeed(); 
    
    // Thiết lập vòng lặp kiểm tra (bắt đầu sau 5 phút nữa)
    setInterval(checkFeed, CHECK_INTERVAL);
});

// Hàm kiểm tra RSS Feed
async function checkFeed() {
    console.log('Đang kiểm tra tin mới...');
    try {
        // 1. Tải và phân tích RSS feed
        // Dòng này sẽ tự động dùng User-Agent chúng ta đã cài đặt ở trên
        const feed = await parser.parseURL(RSS_FEED_URL);
        
        if (!feed.items || feed.items.length === 0) {
            console.log('Feed rỗng hoặc không có bài đăng.');
            return;
        }

        // 2. Lấy bài đăng mới nhất
        const latestPost = feed.items[0];
        const postGUID = latestPost.guid || latestPost.link;

        // 3. Kiểm tra xem bài đăng này có khác với bài đã lưu hay không
        if (postGUID !== lastPostGUID) {
            
            if (lastPostGUID === null) {
                console.log(`Lần chạy đầu tiên, đăng bài mới nhất: ${latestPost.title}`);
            } else {
                console.log(`🔥 Phát hiện bài đăng mới: ${latestPost.title}`);
            }
            
            lastPostGUID = postGUID; 

            // 4. Gửi thông báo lên Discord
            const channel = await client.channels.cache.get(CHANNEL_ID);
            if (channel) {
                
                // --- BẮT ĐẦU PHẦN EMBED ĐẸP ---

                const postDate = new Date(latestPost.pubDate);
                const discordTimestamp = `<t:${Math.floor(postDate.getTime() / 1000)}:R>`;

                let description = latestPost.contentSnippet || 'Không có mô tả...';
                if (description.length > 400) {
                    description = description.slice(0, 400) + '...';
                }
                
                // Tô đậm description
                description = `**${description}**`;

                // --- (QUAN TRỌNG) CỐ GẮNG TÌM HÌNH ẢNH (ĐÃ NÂNG CẤP) ---
                let imageUrl = null;

                if (latestPost.enclosure && latestPost.enclosure.url) {
                    imageUrl = latestPost.enclosure.url;
                }
                else if (latestPost['media:content'] && latestPost['media:content']['$'] && latestPost['media:content']['$'].url) {
                    imageUrl = latestPost['media:content']['$'].url;
                }
                else {
                    const content = latestPost.content || latestPost.contentSnippet || '';
                    const regex = /<img[^>]+src="([^"]+)"/;
                    const match = content.match(regex);
                    
                    if (match && match[1]) {
                        imageUrl = match[1];
                        console.log('Đã tìm thấy hình ảnh từ nội dung (content fallback).');
                    }
                }
                // --- KẾT THÚC PHẦN TÌM HÌNH ẢNH ---


                const embed = new EmbedBuilder()
                    .setAuthor({
                        name: feed.title || 'Hóng Hớt Đường Phố',
                        iconURL: feed.image ? feed.image.url : 'https://files.catbox.moe/rd0pgw.png', // Icon mặc định
                        url: feed.link || latestPost.link
                    })
                    .setTitle(latestPost.title || '🔥 BIẾN NÓNG HỔI! 🔥')
                    .setURL(latestPost.link)
                    .setDescription(description) 
                    .setColor('#FF4500') 
                    .addFields(
                        { name: '⏰ Thời gian đăng', value: discordTimestamp, inline: true },
                        { name: '🔗 Xem chi tiết', value: `[Click vào đây](${latestPost.link})`, inline: true }
                    )
                    .setTimestamp(postDate)
                    .setFooter({ 
                        text: `Tin được hóng bởi ${client.user.username}`,
                        iconURL: client.user.displayAvatarURL()
                    });

                if (imageUrl) {
                    embed.setImage(imageUrl); 
                }
                
                // --- KẾT THÚC PHẦN EMBED ĐẸP ---

                // Gửi tin nhắn
                await channel.send({ 
                    content: `📣 **CÓ BIẾN MỚI!** 📣`,
                    embeds: [embed] 
                });
                
                console.log('Đã đăng bài mới lên Discord.');

            } else {
                console.error(`Không tìm thấy kênh với ID: ${CHANNEL_ID}`);
            }
        } else {
            console.log('Không có tin mới (trùng với tin đã đăng).');
        }

    } catch (error) {
        console.error('Lỗi khi kiểm tra RSS feed:', error.message);
    }
}

// Đăng nhập bot
client.login(TOKEN);
