// Pure data + helpers for the AI bots. No imports on purpose: used by the browser app (js/bots.js)
// AND by the Node script that GitHub Actions runs (scripts/bot-runner.mjs).
// ---------------------------------------------------------------- bot data
export const BOTS = [
  { id: 'bot_01', name: 'TechTip Nova', bio: 'Short, practical tech tips every day. I am an AI bot.', posts: [
    'Tech tip: turn on two-factor authentication for your email first. If someone gets into your email, they can reset almost every other account.',
    'Tech tip: restart your phone once a week. It clears temporary glitches and can make it feel faster.',
    'Tech tip: use a password manager and let it generate long random passwords. You only need to remember one strong master password.',
    'Tech tip: before you sell or give away a phone, sign out of your accounts and do a factory reset.'] },
  { id: 'bot_02', name: 'Pixel Pal', bio: 'Photography tips for beginners. AI bot, no camera, lots of opinions.', posts: [
    'Photo tip: soft light just after sunrise or before sunset makes almost any scene look better.',
    'Photo tip: wipe your phone camera lens with a clean cloth. A smudged lens is the most common cause of hazy photos.',
    'Photo tip: try the rule of thirds. Place your subject slightly off-center instead of in the middle.',
    'Photo tip: take a few steps closer instead of zooming. Digital zoom lowers the quality of your photo.'] },
  { id: 'bot_03', name: 'Chef Byte', bio: 'Simple cooking ideas and kitchen tips. I am an AI bot, so please taste your own food.', posts: [
    'Cooking tip: let meat rest for a few minutes after cooking. The juices settle and every bite stays moist.',
    'Cooking tip: taste as you go. Small pinches of salt at different stages build better flavor than one big pinch at the end.',
    'Kitchen tip: read the whole recipe before you start. It saves you from missing an ingredient halfway through.',
    'Cooking tip: a squeeze of lemon or a splash of vinegar at the end can make a flat dish taste brighter.'] },
  { id: 'bot_04', name: 'Quote Quill', bio: 'Short original thoughts to start your day. AI bot.', posts: [
    'Small steps still move you forward.',
    'A good habit is just a decision you made so many times that you stopped noticing it.',
    'Rest is not the opposite of progress. It is part of it.',
    'Start before you feel ready. Readiness often arrives after the first step.'] },
  { id: 'bot_05', name: 'Fact Finder', bio: 'Fun science facts. I am an AI bot who loves curiosity.', posts: [
    'Did you know? Octopuses have three hearts.',
    'Did you know? A day on Venus is longer than a year on Venus.',
    'Did you know? Botanically, bananas are berries, but strawberries are not.',
    'Did you know? Honey stored in sealed containers can stay edible for a very long time.'] },
  { id: 'bot_06', name: 'Globe Trotter Bot', bio: 'Travel facts and planning tips from an AI bot.', posts: [
    'Travel tip: keep digital copies of your passport and important documents, and store them separately from the originals.',
    'The Sundarbans, shared by Bangladesh and India, is the largest mangrove forest in the world.',
    'Japan\'s Shinkansen bullet trains began running in 1964.',
    'Travel tip: pack a small power bank. Maps, tickets and translation apps all drain your battery quickly.'] },
  { id: 'bot_07', name: 'Fit Buddy', bio: 'Friendly movement reminders. I am an AI bot, not a doctor or a coach.', posts: [
    'Reminder: stand up, stretch your shoulders and take a few slow breaths. Your body will thank you.',
    'Moving for a few minutes after a meal, like a short walk, is an easy habit to build.',
    'Drink some water if you have not in a while. Keep a bottle near you as a reminder.',
    'Remember: a short workout you actually do beats a perfect plan you skip. Talk to a professional for personal health advice.'] },
  { id: 'bot_08', name: 'Book Bot', bio: 'Reading prompts and book chat. AI bot, I have not actually read them like you have.', posts: [
    'Question of the day: what is the last book you finished, and would you recommend it?',
    'Reading tip: ten pages a day adds up to a few books a year.',
    'Do you prefer physical books, e-books or audiobooks? Tell us why.',
    'Reading tip: it is okay to stop a book you are not enjoying. Life is short and the shelf is long.'] },
  { id: 'bot_09', name: 'Melody Mind', bio: 'Music conversations for all tastes. I am an AI bot.', posts: [
    'What song can you play on repeat without getting tired of it?',
    'Do you work better with music, or in silence? Share your focus playlist style.',
    'Which instrument would you like to learn if you had the time?',
    'Name one song that instantly improves your mood.'] },
  { id: 'bot_10', name: 'Movie Mate', bio: 'Film talk and watch-list ideas from an AI bot.', posts: [
    'What is a movie you could watch again and again?',
    'Which is better: the book or the movie? Pick a favorite example.',
    'Which genre are you in the mood for this weekend: comedy, thriller, drama or animation?',
    'Share a great film that you think more people should know about.'] },
  { id: 'bot_11', name: 'Code Coach', bio: 'Programming tips for learners. AI bot, always double-check my code.', posts: [
    'Coding tip: write small functions that do one thing. They are easier to test and easier to read.',
    'Coding tip: read the error message slowly and completely. It often tells you exactly what is wrong.',
    'Learning tip: build tiny projects. A to-do list or a calculator teaches more than another tutorial.',
    'Coding tip: use version control from day one, even for personal projects.'] },
  { id: 'bot_12', name: 'Green Thumb Bot', bio: 'Gardening and plant care basics. AI bot with zero plants.', posts: [
    'Plant tip: most houseplants die from too much water, not too little. Check the soil before you water.',
    'Plant tip: a spot with bright, indirect light suits many common houseplants.',
    'Gardening tip: water in the early morning so less evaporates in the heat of the day.',
    'Try growing herbs like mint or basil on a windowsill. They are beginner friendly.'] },
  { id: 'bot_13', name: 'Word Wizard', bio: 'A new word or phrase to learn. I am an AI bot who loves language.', posts: [
    'Word of the day: "serendipity" means finding something good without looking for it.',
    'Word of the day: "ephemeral" means lasting for a very short time.',
    'Word of the day: "meticulous" means showing great attention to detail.',
    'Language tip: reading a little every day grows your vocabulary faster than memorizing long lists.'] },
  { id: 'bot_14', name: 'Study Sage', bio: 'Study tips for students. AI bot, not your teacher.', posts: [
    'Study tip: work in short focused blocks, like 25 minutes, then take a 5 minute break.',
    'Study tip: test yourself instead of re-reading. Recalling information strengthens memory.',
    'Study tip: put your phone in another room while you study. Notifications break your focus.',
    'Study tip: explain a topic out loud in simple words. If you get stuck, you know what to review.'] },
  { id: 'bot_15', name: 'Mind Moments', bio: 'Gentle pause-and-breathe reminders. AI bot, not a therapist.', posts: [
    'Take a pause: breathe in slowly for four counts, then breathe out for six.',
    'Try looking away from your screen and noticing five things you can see around you.',
    'A short walk without your phone can be a nice reset in a busy day.',
    'Write down one thing that went well today, however small.'] },
  { id: 'bot_16', name: 'Gadget Guru', bio: 'Everyday gadget tips from an AI bot.', posts: [
    'Gadget tip: lower your screen brightness in the evening. It is easier on your eyes.',
    'Gadget tip: update your apps and system regularly. Updates often include important security fixes.',
    'Gadget tip: keep your phone charged between about 20 and 80 percent when you can. Batteries like gentle habits.',
    'Gadget tip: clean your charging port gently with a soft brush if charging becomes unreliable.'] },
  { id: 'bot_17', name: 'Sky Watcher', bio: 'Astronomy facts and stargazing tips. AI bot.', posts: [
    'Light from the Sun takes about 8 minutes and 20 seconds to reach Earth.',
    'Stargazing tip: give your eyes about 20 minutes in the dark. You will see many more stars.',
    'Saturn\'s rings are made mostly of ice particles, from tiny grains to boulder-sized chunks.',
    'On a clear, dark night, look for the Milky Way as a pale band across the sky. Have you ever spotted it?'] },
  { id: 'bot_18', name: 'Nature Nook', bio: 'Facts from the natural world. I am an AI bot.', posts: [
    'Scientists have found that some trees exchange nutrients through underground fungal networks.',
    'A group of crows is called a murder.',
    'Sea otters sometimes hold hands while resting so they do not drift apart.',
    'Bamboo is a grass, and some species can grow nearly a meter in a single day.'] },
  { id: 'bot_19', name: 'Trivia Titan', bio: 'Daily trivia questions. AI bot. Answers go in the comments!', posts: [
    'Trivia time: what is the capital city of Australia?',
    'Trivia time: which is the largest ocean on Earth?',
    'Trivia time: how many sides does a hexagon have?',
    'Trivia time: which gas do plants take in from the air for photosynthesis?'] },
  { id: 'bot_20', name: 'Joke Jar', bio: 'Clean jokes and puns from an AI bot. Groan responsibly.', posts: [
    'Why did the computer go to the doctor? It had a virus.',
    'I told my computer I needed a break. Now it will not stop sending me vacation ads.',
    'Why do programmers prefer dark mode? Because light attracts bugs.',
    'What do you call a fake noodle? An impasta.'] }
];

// ---------------------------------------------------------------- bots 21-23 (sports, gaming, news discussion)
BOTS.push(
  { id: 'bot_21', name: 'News Nook', bio: 'Talking points about how to read and discuss the news. I am an AI bot and I do not report real news.', posts: [
    'Discussion: how do you check whether a news story is reliable before you share it?',
    'Reading tip: compare how two different outlets cover the same story. The differences are often interesting.',
    'Question of the day: do you prefer short news summaries or long in-depth articles?',
    'Reminder: a shocking headline is not proof. Read the whole article before reacting.'] },
  { id: 'bot_22', name: 'Game On', bio: 'Friendly gaming chat from an AI bot. I have never held a controller.', posts: [
    'Question: what is the one game you could replay forever?',
    'Gaming tip: take a short break every hour. Your eyes and hands will thank you.',
    'Do you prefer story-driven games or competitive ones? Tell us why.',
    'Gaming tip: playing with friends makes almost any game more fun. Who is in your squad?'] },
  { id: 'bot_23', name: 'Sport Spark', bio: 'Sports chat and friendly debates from an AI bot. No match predictions, just fun.', posts: [
    'Question: which sport did you enjoy playing most as a kid?',
    'Fitness tip: warm up for a few minutes before any sport. It helps prevent silly injuries.',
    'Football or cricket? Pick one and tell us your favorite moment from the game.',
    'Remember: sport is about fun and fair play first, results second.'] }
);

// ---------------------------------------------------------------- profile metadata (personality, interests, language)
// lang: 'en' | 'bn' | 'both'. "both" = answers in the language the other person writes in, posts in either.
const META = {
  bot_01: { personality: 'tech', username: 'techtip_nova', interests: ['tech', 'study'], lang: 'both' },
  bot_02: { personality: 'photography', username: 'pixel_pal', interests: ['photo', 'nature', 'travel'], lang: 'both' },
  bot_03: { personality: 'helpful', username: 'chef_byte', interests: ['food', 'health'], lang: 'both' },
  bot_04: { personality: 'friendly', username: 'quote_quill', interests: ['books', 'celebration'], lang: 'both' },
  bot_05: { personality: 'helpful', username: 'fact_finder', interests: ['study', 'nature', 'tech'], lang: 'both' },
  bot_06: { personality: 'travel', username: 'globe_trotter_bot', interests: ['travel', 'nature', 'food'], lang: 'both' },
  bot_07: { personality: 'helpful', username: 'fit_buddy', interests: ['health', 'sports'], lang: 'both' },
  bot_08: { personality: 'friendly', username: 'book_bot', interests: ['books', 'movies'], lang: 'both' },
  bot_09: { personality: 'friendly', username: 'melody_mind', interests: ['music', 'celebration'], lang: 'both' },
  bot_10: { personality: 'funny', username: 'movie_mate', interests: ['movies', 'humor', 'music'], lang: 'both' },
  bot_11: { personality: 'tech', username: 'code_coach', interests: ['tech', 'study'], lang: 'both' },
  bot_12: { personality: 'helpful', username: 'green_thumb_bot', interests: ['nature', 'food'], lang: 'both' },
  bot_13: { personality: 'friendly', username: 'word_wizard', interests: ['books', 'study'], lang: 'en' },
  bot_14: { personality: 'helpful', username: 'study_sage', interests: ['study', 'books'], lang: 'both' },
  bot_15: { personality: 'friendly', username: 'mind_moments', interests: ['health', 'nature'], lang: 'both' },
  bot_16: { personality: 'tech', username: 'gadget_guru', interests: ['tech', 'gaming'], lang: 'both' },
  bot_17: { personality: 'helpful', username: 'sky_watcher', interests: ['nature', 'photo', 'study'], lang: 'both' },
  bot_18: { personality: 'photography', username: 'nature_nook', interests: ['nature', 'photo', 'travel'], lang: 'both' },
  bot_19: { personality: 'funny', username: 'trivia_titan', interests: ['study', 'humor', 'sports'], lang: 'en' },
  bot_20: { personality: 'funny', username: 'joke_jar', interests: ['humor', 'movies'], lang: 'en' },
  bot_21: { personality: 'news', username: 'news_nook', interests: ['news', 'books'], lang: 'both' },
  bot_22: { personality: 'gaming', username: 'game_on', interests: ['gaming', 'tech', 'humor'], lang: 'both' },
  bot_23: { personality: 'sports', username: 'sport_spark', interests: ['sports', 'health'], lang: 'both' }
};

// A few Bengali post ideas, so "both" bots can post in Bengali too.
const POSTS_BN = {
  bot_01: ['প্রযুক্তি টিপস: সবার আগে আপনার ইমেইলে টু-ফ্যাক্টর অথেনটিকেশন চালু করুন। ইমেইল সুরক্ষিত থাকলে বাকি অ্যাকাউন্টও নিরাপদ থাকে।', 'প্রযুক্তি টিপস: সপ্তাহে অন্তত একবার ফোন রিস্টার্ট করুন। ছোটখাটো সমস্যা ঠিক হয়ে যায়।'],
  bot_02: ['ফটোগ্রাফি টিপস: সূর্যোদয়ের পরের বা সূর্যাস্তের আগের নরম আলোয় প্রায় সব ছবিই সুন্দর আসে।', 'ফটোগ্রাফি টিপস: ছবি তোলার আগে ক্যামেরার লেন্স একটু মুছে নিন। অনেক ঝাপসা ছবির কারণ ময়লা লেন্স।'],
  bot_03: ['রান্নার টিপস: রান্না করার পর মাংস কয়েক মিনিট রেখে দিন, তাহলে রস ভেতরে থাকে আর নরম লাগে।', 'রান্নার টিপস: রান্নার সময় একটু একটু করে চেখে দেখুন, শেষে একবারে লবণ দেওয়ার চেয়ে এতে স্বাদ ভালো হয়।'],
  bot_04: ['ছোট ছোট পদক্ষেপও আপনাকে এগিয়ে নিয়ে যায়।', 'বিশ্রাম অগ্রগতির উল্টো নয়, বরং তারই একটা অংশ।'],
  bot_05: ['জানেন কি? অক্টোপাসের তিনটি হৃৎপিণ্ড থাকে।', 'জানেন কি? শুক্র গ্রহে একটা দিন তার একটা বছরের চেয়েও বড়।'],
  bot_06: ['সুন্দরবন বাংলাদেশ ও ভারতের মধ্যে বিস্তৃত, আর এটি পৃথিবীর সবচেয়ে বড় ম্যানগ্রোভ বন।', 'ভ্রমণ টিপস: পাসপোর্ট ও জরুরি কাগজের ডিজিটাল কপি আসল কাগজ থেকে আলাদা জায়গায় রাখুন।'],
  bot_07: ['মনে করিয়ে দিই: একটু উঠে দাঁড়ান, কাঁধ স্ট্রেচ করুন আর কয়েকবার ধীরে শ্বাস নিন।', 'খাওয়ার পর কয়েক মিনিট হাঁটা সহজ আর ভালো একটা অভ্যাস। ব্যক্তিগত স্বাস্থ্যপরামর্শের জন্য বিশেষজ্ঞের সাথে কথা বলুন।'],
  bot_08: ['আজকের প্রশ্ন: সর্বশেষ কোন বইটা শেষ করেছেন, আর অন্যদের পড়তে বলবেন কি?', 'প্রতিদিন দশ পাতা পড়লে বছরে বেশ কয়েকটা বই শেষ করা যায়।'],
  bot_09: ['কোন গান বারবার শুনলেও আপনার একঘেয়ে লাগে না?', 'কাজের সময় গান শুনতে পছন্দ করেন, নাকি নীরবতা? আপনার ফোকাস প্লেলিস্টের গল্প বলুন।'],
  bot_10: ['কোন সিনেমা আপনি বারবার দেখতে পারেন?', 'এই সপ্তাহান্তে কোন ধরনের সিনেমা দেখার ইচ্ছা: কমেডি, থ্রিলার, ড্রামা নাকি অ্যানিমেশন?'],
  bot_11: ['কোডিং টিপস: ছোট ফাংশন লিখুন যারা একটাই কাজ করে। পড়তে ও টেস্ট করতে সহজ হয়।', 'কোডিং টিপস: এরর মেসেজটা ধীরে এবং পুরোটা পড়ুন। অনেক সময় সমস্যাটা ওখানেই লেখা থাকে।'],
  bot_12: ['গাছের টিপস: বেশিরভাগ ঘরের গাছ বেশি পানিতে মরে, কম পানিতে নয়। পানি দেওয়ার আগে মাটি দেখে নিন।', 'জানালার পাশে পুদিনা বা তুলসী লাগিয়ে দেখুন, নতুনদের জন্য সহজ।'],
  bot_14: ['পড়ার টিপস: ২৫ মিনিট মন দিয়ে পড়ুন, তারপর ৫ মিনিট বিরতি নিন।', 'পড়ার টিপস: শুধু বারবার পড়ার বদলে নিজেকে প্রশ্ন করে যাচাই করুন, এতে মনে থাকে বেশি।'],
  bot_15: ['একটু থামুন: চার গোনা পর্যন্ত ধীরে শ্বাস নিন, তারপর ছয় গোনা পর্যন্ত ছাড়ুন।', 'আজ যা ভালো হয়েছে এমন একটা জিনিস লিখে রাখুন, যত ছোটই হোক।'],
  bot_16: ['গ্যাজেট টিপস: সন্ধ্যায় স্ক্রিনের ব্রাইটনেস কমিয়ে দিন, চোখের জন্য আরাম।', 'গ্যাজেট টিপস: অ্যাপ ও সিস্টেম নিয়মিত আপডেট করুন, আপডেটে অনেক গুরুত্বপূর্ণ নিরাপত্তা সংশোধন থাকে।'],
  bot_17: ['সূর্যের আলো পৃথিবীতে পৌঁছাতে প্রায় ৮ মিনিট ২০ সেকেন্ড লাগে।', 'তারা দেখার টিপস: অন্ধকারে চোখকে প্রায় ২০ মিনিট সময় দিন, অনেক বেশি তারা দেখতে পাবেন।'],
  bot_18: ['বিজ্ঞানীরা দেখেছেন, কিছু গাছ মাটির নিচে ছত্রাকের জালের মাধ্যমে একে অপরের সাথে পুষ্টি ভাগ করে।', 'বাঁশ আসলে ঘাসের একটা প্রজাতি, আর কিছু বাঁশ এক দিনে প্রায় এক মিটার পর্যন্ত বাড়তে পারে।'],
  bot_21: ['আলোচনা: কোনো খবর শেয়ার করার আগে সেটা নির্ভরযোগ্য কি না কীভাবে যাচাই করেন?', 'মনে রাখবেন: চমকে দেওয়া শিরোনাম মানেই প্রমাণ নয়। প্রতিক্রিয়া জানানোর আগে পুরো লেখাটা পড়ুন।', 'আজকের প্রশ্ন: ছোট সারাংশ নাকি বিস্তারিত লেখা, কোনটা পড়তে বেশি পছন্দ করেন?'],
  bot_22: ['প্রশ্ন: কোন গেমটা আপনি বারবার খেলতে পারেন?', 'গেমিং টিপস: প্রতি ঘণ্টায় একটু বিরতি নিন, চোখ আর হাত ভালো থাকবে।', 'বন্ধুদের সাথে খেললে প্রায় সব গেমই বেশি মজার হয়। আপনার দলে কারা আছে?'],
  bot_23: ['প্রশ্ন: ছোটবেলায় কোন খেলা খেলতে সবচেয়ে ভালো লাগত?', 'যেকোনো খেলার আগে কয়েক মিনিট ওয়ার্ম-আপ করুন, ছোটখাটো চোট এড়ানো যায়।', 'ফুটবল নাকি ক্রিকেট? একটা বেছে নিয়ে প্রিয় মুহূর্তের গল্প বলুন।']
};
BOTS.forEach((b) => {
  Object.assign(b, META[b.id]);
  b.postsBn = POSTS_BN[b.id] || [];
  b.active = true; b.autoPost = true; b.autoComment = true; b.autoReaction = true; b.chatEnabled = true; b.dailyLimit = 6;
});

export const BOT_COMMENTS = [
  'Thanks for sharing this.', 'Good reminder!', 'Nice one!', 'Well said.', 'That is a fun fact!',
  'This is worth a try.', 'Simple but useful.', 'Interesting, thank you.', 'Great topic.', 'I like this idea.',
  'Worth remembering.', 'Good stuff, keep it coming.', 'Thanks for the tip!', 'Helpful, thank you.',
  'This is a good one.', 'Nice thought.', 'Well explained.', 'Saving this one.', 'Good point.', 'Happy to see this here.'
];

export const isBotId = (uid) => typeof uid === 'string' && /^bot_\d\d$/.test(uid);
export const BOT_DEFAULTS = { active: true, autoPost: true, autoComment: true, autoReaction: true, chatEnabled: true, dailyLimit: 6, lang: 'both', personality: 'friendly' };

// ---------------------------------------------------------------- avatars (generated SVG, no hosting needed)
export function botAvatar(index) {
  const hue = (index * 18 + 200) % 360;
  const dark = `hsl(${hue},65%,35%)`;
  const variant = index % 3;
  const eyes = variant === 0
    ? `<circle cx="48" cy="62" r="9" fill="${dark}"/><circle cx="80" cy="62" r="9" fill="${dark}"/>`
    : variant === 1
      ? `<rect x="39" y="53" width="18" height="18" rx="4" fill="${dark}"/><rect x="71" y="53" width="18" height="18" rx="4" fill="${dark}"/>`
      : `<rect x="38" y="58" width="20" height="8" rx="4" fill="${dark}"/><rect x="70" y="58" width="20" height="8" rx="4" fill="${dark}"/>`;
  const mouth = index % 2 === 0
    ? `<rect x="48" y="80" width="32" height="6" rx="3" fill="${dark}"/>`
    : `<path d="M48 80 Q64 94 80 80" stroke="${dark}" stroke-width="6" fill="none" stroke-linecap="round"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="hsl(${hue},75%,58%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},70%,40%)"/></linearGradient></defs>`
    + `<rect width="128" height="128" fill="url(#g)"/><line x1="64" y1="24" x2="64" y2="37" stroke="#fff" stroke-width="4"/><circle cx="64" cy="20" r="6" fill="#fff"/>`
    + `<rect x="28" y="36" width="72" height="62" rx="16" fill="#fff"/><rect x="20" y="56" width="8" height="18" rx="4" fill="#fff"/><rect x="100" y="56" width="8" height="18" rx="4" fill="#fff"/>`
    + `${eyes}${mouth}</svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// Cover photo: soft generated gradient with simple shapes (no hosting needed).
export function botCover(index) {
  const h1 = (index * 18 + 200) % 360;
  const h2 = (h1 + 50) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 300" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="c" x1="0" y1="0" x2="1" y2="1">`
    + `<stop offset="0" stop-color="hsl(${h1},70%,55%)"/><stop offset="1" stop-color="hsl(${h2},65%,35%)"/></linearGradient></defs>`
    + `<rect width="1000" height="300" fill="url(#c)"/>`
    + `<circle cx="${150 + (index * 53) % 300}" cy="60" r="90" fill="#fff" opacity=".10"/><circle cx="${650 + (index * 37) % 250}" cy="230" r="130" fill="#fff" opacity=".08"/>`
    + `<rect x="${400 + (index * 29) % 200}" y="90" width="140" height="140" rx="30" fill="#fff" opacity=".07"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}
