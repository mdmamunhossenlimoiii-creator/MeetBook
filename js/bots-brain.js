// Template "brain" for the AI bots: pure functions, no imports, no network, no LLM.
// Used by the browser (admin tools, previews) and by the Node scripts that GitHub Actions runs.
//
// Honest limits (also stated in the README):
//  * It is keyword + template based. It reads the TEXT of a post/message (English and Bengali).
//    It cannot look at the pixels of an image: for a photo it only reacts to the caption.
//  * It never claims to be human and never invents facts about the person it talks to.

// ---------------------------------------------------------------- personalities
export const PERSONALITIES = {
  friendly: { label: 'Friendly', interests: ['celebration', 'general'] },
  funny: { label: 'Funny', interests: ['humor', 'movies'] },
  helpful: { label: 'Helpful', interests: ['study', 'health', 'food'] },
  tech: { label: 'Tech Lover', interests: ['tech', 'study'] },
  sports: { label: 'Sports Lover', interests: ['sports', 'health'] },
  photography: { label: 'Photography Lover', interests: ['photo', 'nature'] },
  travel: { label: 'Travel Lover', interests: ['travel', 'nature', 'food'] },
  gaming: { label: 'Gaming Lover', interests: ['gaming', 'tech'] },
  news: { label: 'News Discussion', interests: ['news', 'books'] }
};
export const LANGUAGES = { en: 'English', bn: 'Bengali', both: 'Both (matches the other person)' };
export const TOPICS = ['tech', 'photo', 'travel', 'food', 'sports', 'gaming', 'news', 'music', 'movies', 'books',
  'health', 'nature', 'study', 'humor', 'celebration'];

// ---------------------------------------------------------------- text helpers
export const normalize = (s) => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
export const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';

export function detectLang(text) {
  const letters = String(text || '').match(/\p{L}/gu) || [];
  if (!letters.length) return 'en';
  const bn = letters.filter((c) => /[ঀ-৿]/.test(c)).length;
  return bn / letters.length > 0.3 ? 'bn' : 'en';
}

const KW = {
  tech: ['tech', 'phone', 'laptop', 'app', 'code', 'coding', 'software', 'computer', 'wifi', 'internet', 'android', 'iphone', 'gadget', 'program', 'website', 'robot', 'প্রযুক্তি', 'ফোন', 'ল্যাপটপ', 'কম্পিউটার', 'অ্যাপ', 'কোড', 'সফটওয়্যার', 'ইন্টারনেট', 'মোবাইল', 'প্রোগ্রামিং'],
  photo: ['photo', 'camera', 'picture', 'shot', 'lens', 'selfie', 'portrait', 'capture', 'ছবি', 'ফটো', 'ক্যামেরা', 'সেলফি', 'তুললাম'],
  travel: ['trip', 'travel', 'tour', 'beach', 'mountain', 'hike', 'flight', 'hotel', 'journey', 'vacation', 'sea', 'island', 'village', 'bazar', 'ভ্রমণ', 'ঘুরতে', 'ট্যুর', 'সমুদ্র', 'পাহাড়', 'বেড়াতে', 'কক্সবাজার', 'সুন্দরবন', 'সিলেট', 'ঘুরলাম'],
  food: ['food', 'cook', 'recipe', 'dinner', 'lunch', 'breakfast', 'biryani', 'coffee', 'cake', 'pizza', 'snack', 'খাবার', 'রান্না', 'ডিনার', 'লাঞ্চ', 'নাস্তা', 'বিরিয়ানি', 'কফি', 'কেক', 'ভাত', 'মাছ', 'চা '],
  sports: ['football', 'cricket', 'match', 'goal', 'tournament', 'player', 'world cup', 'tennis', 'badminton', 'ফুটবল', 'ক্রিকেট', 'ম্যাচ', 'খেলা', 'গোল', 'টুর্নামেন্ট'],
  gaming: ['gaming', 'gamer', 'pubg', 'minecraft', 'fortnite', 'playstation', 'xbox', 'esports', 'free fire', 'গেম', 'গেমিং', 'ফ্রি ফায়ার'],
  news: ['news', 'election', 'government', 'policy', 'economy', 'headline', 'budget', 'খবর', 'সংবাদ', 'নির্বাচন', 'সরকার', 'অর্থনীতি', 'বাজেট'],
  music: ['song', 'music', 'playlist', 'guitar', 'concert', 'singer', 'গান', 'সংগীত', 'গিটার', 'কনসার্ট'],
  movies: ['movie', 'film', 'series', 'netflix', 'cinema', 'মুভি', 'সিনেমা', 'নাটক', 'ফিল্ম'],
  books: ['book', 'reading', 'novel', 'author', 'library', 'বই', 'উপন্যাস', 'লাইব্রেরি', 'পড়ছি'],
  health: ['gym', 'workout', 'jog', 'yoga', 'health', 'walk', 'exercise', 'ব্যায়াম', 'হাঁটা', 'স্বাস্থ্য', 'যোগব্যায়াম'],
  nature: ['tree', 'flower', 'garden', 'plant', 'rain', 'sky', 'river', 'sunset', 'sunrise', 'forest', 'গাছ', 'ফুল', 'বৃষ্টি', 'আকাশ', 'নদী', 'সূর্যাস্ত', 'সূর্যোদয়', 'বাগান'],
  study: ['exam', 'study', 'student', 'school', 'university', 'homework', 'class', 'learn', 'পরীক্ষা', 'পড়াশোনা', 'ক্লাস', 'বিশ্ববিদ্যালয়', 'স্কুল', 'শিখ'],
  humor: ['joke', 'funny', 'lol', 'haha', 'meme', '😂', '🤣', 'হাহা', 'মজা', 'হাসি'],
  celebration: ['birthday', 'congratulations', 'congrats', 'graduated', 'wedding', 'new job', 'anniversary', 'promotion', 'জন্মদিন', 'বিয়ে', 'অভিনন্দন', 'বিবাহ', 'সফল']
};
// Posts we never answer with a canned line (grief, illness, accidents, distress).
const SENSITIVE = ['died', 'death', 'passed away', 'funeral', 'accident', 'hospital', 'cancer', 'depress', 'lonely', 'miss him', 'miss her', 'rip',
  'মারা', 'মৃত্যু', 'দুর্ঘটনা', 'হাসপাতাল', 'ক্যান্সার', 'ডিপ্রেশন', 'একা লাগছে', 'কষ্ট', 'হারিয়ে', 'ইন্না লিল্লাহি'];
const CRISIS = ['suicide', 'kill myself', 'end my life', 'want to die', 'self harm', 'self-harm', 'hurt myself', 'no reason to live',
  'আত্মহত্যা', 'মরে যেতে চাই', 'নিজেকে শেষ', 'বাঁচতে চাই না', 'নিজেকে কষ্ট দিতে'];

const hits = (text, words) => {
  const t = ` ${String(text || '').toLowerCase()} `;
  return words.filter((w) => (/^[\x00-\x7f]+$/.test(w) ? new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t) : t.includes(w)));
};

// Ranked list of topics found in the text (most keyword hits first).
export function detectTopics(text) {
  return Object.entries(KW)
    .map(([k, words]) => [k, hits(text, words).length])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([k]) => k);
}
export const isSensitive = (text) => hits(text, SENSITIVE).length > 0 || hasCrisis(text);
export const hasCrisis = (text) => hits(text, CRISIS).length > 0;
export const isQuestion = (text) => /\?|？|\b(why|how|what|which|who|when|where)\b|কেন|কীভাবে|কিভাবে|কি |কী |কোথায়|কখন|কে /i.test(String(text || ''));

// ---------------------------------------------------------------- phrase books
// Neutral one-liners per topic: they read fine as a comment on a post AND as a chat reply.
const LINES = {
  tech: {
    en: ['Small tech habits really add up over time.', 'Always back up what matters before trying something new.', 'Tech is most fun when you build something with it.', 'Updates and strong passwords are the boring habits that save you later.'],
    bn: ['ছোট ছোট প্রযুক্তি-অভ্যাস সময়ের সাথে অনেক কাজে আসে।', 'নতুন কিছু চেষ্টা করার আগে দরকারি জিনিসের ব্যাকআপ রাখা ভালো।', 'কিছু বানালে প্রযুক্তি শেখা সবচেয়ে মজার হয়।', 'নিয়মিত আপডেট আর শক্ত পাসওয়ার্ড বিরক্তিকর হলেও পরে বাঁচিয়ে দেয়।']
  },
  photo: {
    en: ['Good light makes such a difference in a photo.', 'Nice to see someone keeping a moment alive with a picture.', 'The caption makes the photo feel even more personal.', 'Photos like this are a great way to remember a day.'],
    bn: ['ছবিতে ভালো আলো বিশাল পার্থক্য গড়ে দেয়।', 'একটা মুহূর্তকে ছবিতে ধরে রাখা সত্যিই সুন্দর।', 'ক্যাপশনটা ছবিটাকে আরও আপন করে তুলেছে।', 'এমন ছবি দিনটাকে মনে রাখার দারুণ উপায়।']
  },
  travel: {
    en: ['Travel stories are the best kind of stories.', 'A trip does not have to be far to feel special.', 'Places always look better with a little curiosity.', 'Bookmarking this for a future trip idea.'],
    bn: ['ভ্রমণের গল্প সবসময়ই সেরা গল্প।', 'দারুণ ভ্রমণের জন্য খুব দূরে যাওয়া লাগে না।', 'একটু কৌতূহল নিয়ে গেলে যেকোনো জায়গাই সুন্দর লাগে।', 'ভবিষ্যতের ভ্রমণ-পরিকল্পনার জন্য এটা মনে রাখলাম।']
  },
  food: {
    en: ['Food always tastes better when it is shared.', 'Homemade meals have a charm of their own.', 'Simple ingredients, done well, are hard to beat.', 'That sounds delicious.'],
    bn: ['ভাগ করে খেলে খাবার আরও মজার হয়।', 'ঘরে বানানো খাবারের নিজস্ব একটা আনন্দ আছে।', 'সাধারণ উপকরণ ঠিকভাবে রান্না করলেই সেরা স্বাদ।', 'শুনে তো দারুণ লাগছে।']
  },
  sports: {
    en: ['Sport brings people together like little else.', 'Whoever wins, a good match is a good match.', 'Practice and teamwork beat talent on its own.', 'Great to see people getting active and enjoying the game.'],
    bn: ['খেলা মানুষকে যেভাবে এক করে, তেমন খুব কম জিনিসই পারে।', 'যে-ই জিতুক, ভালো ম্যাচ মানেই ভালো ম্যাচ।', 'শুধু প্রতিভা নয়, অনুশীলন আর টিমওয়ার্কই আসল।', 'সবাই খেলায় মেতে আছে দেখতে ভালো লাগে।']
  },
  gaming: {
    en: ['Games are better with good company.', 'Every level feels easier on the second try.', 'Taking short breaks keeps gaming fun.', 'Always good to hear what people are playing.'],
    bn: ['ভালো সঙ্গী থাকলে গেম আরও মজার হয়।', 'দ্বিতীয়বার চেষ্টা করলে যেকোনো লেভেল সহজ লাগে।', 'মাঝে মাঝে বিরতি নিলে গেমিং মজার থাকে।', 'কে কী খেলছে শুনতে সবসময়ই ভালো লাগে।']
  },
  news: {
    en: ['It helps to read more than one source on any story.', 'Thoughtful discussion beats loud arguments.', 'Worth checking the original report before sharing.', 'Respectful disagreement is how we all learn.'],
    bn: ['যেকোনো খবর একাধিক সূত্রে পড়ে নেওয়া ভালো।', 'চিৎকারের তর্কের চেয়ে ভেবেচিন্তে আলোচনা অনেক ভালো।', 'শেয়ার করার আগে মূল প্রতিবেদনটা দেখে নেওয়া ভালো।', 'শ্রদ্ধার সাথে ভিন্নমত প্রকাশ করলেই আমরা শিখি।']
  },
  music: {
    en: ['Music can change a whole mood in one song.', 'There is a song for every kind of day.', 'Good music is even better with a story behind it.'],
    bn: ['একটা গান পুরো মনের অবস্থা বদলে দিতে পারে।', 'প্রতিটা দিনের জন্য একটা গান আছে।', 'পেছনে গল্প থাকলে ভালো গান আরও ভালো লাগে।']
  },
  movies: {
    en: ['A good story stays with you long after it ends.', 'Always room on the watch-list for one more recommendation.', 'Movies are better with popcorn and good company.'],
    bn: ['ভালো গল্প শেষ হওয়ার পরেও অনেকক্ষণ মনে থাকে।', 'দেখার তালিকায় আরেকটা সুপারিশের জায়গা সবসময় আছে।', 'পপকর্ন আর ভালো সঙ্গ থাকলে সিনেমা আরও জমে।']
  },
  books: {
    en: ['A few pages a day really do add up.', 'Books are a cheap way to travel anywhere.', 'Reading is a good way to slow down.'],
    bn: ['প্রতিদিন কয়েক পাতা পড়লেও অনেক জমে যায়।', 'বই হলো যেকোনো জায়গায় ঘুরে আসার সস্তা উপায়।', 'বই পড়া ধীর হয়ে বসার ভালো একটা উপায়।']
  },
  health: {
    en: ['Small, regular movement beats rare big efforts.', 'Rest and water matter as much as the workout.', 'Good for you for staying active.'],
    bn: ['মাঝেমধ্যে বড় চেষ্টার চেয়ে নিয়মিত ছোট ব্যায়াম ভালো।', 'ব্যায়ামের মতোই বিশ্রাম আর পানি জরুরি।', 'সক্রিয় থাকছেন, দারুণ ব্যাপার।']
  },
  nature: {
    en: ['Nature has a way of calming everything down.', 'The little details outdoors are easy to miss, so it is nice you noticed.', 'A bit of green and sky does wonders.'],
    bn: ['প্রকৃতি সবকিছু শান্ত করে দেওয়ার ক্ষমতা রাখে।', 'প্রকৃতির ছোট ছোট খুঁটিনাটি সহজেই চোখ এড়ায়, আপনি খেয়াল করেছেন ভালো লাগল।', 'একটু সবুজ আর আকাশ অনেক কাজ করে।']
  },
  study: {
    en: ['Short, regular study sessions work better than one long cram.', 'Asking questions is the fastest way to learn.', 'Best of luck with your studies!'],
    bn: ['একদিনে অনেকক্ষণ না পড়ে অল্প অল্প করে নিয়মিত পড়া বেশি কাজের।', 'প্রশ্ন করাই শেখার দ্রুততম উপায়।', 'পড়াশোনার জন্য শুভকামনা!']
  },
  humor: {
    en: ['That is a good one.', 'A good laugh is the best way to reset a day.', 'Humor like this is welcome here.'],
    bn: ['এটা বেশ মজার।', 'একটু হাসি দিনটা নতুন করে শুরু করার সেরা উপায়।', 'এমন মজা এখানে সবসময় স্বাগত।']
  },
  celebration: {
    en: ['Congratulations, that is wonderful news!', 'Wishing you lots of happiness!', 'Great to see a reason to celebrate.'],
    bn: ['অভিনন্দন, দারুণ খবর!', 'অনেক অনেক সুখী হোন, শুভকামনা রইল!', 'উদযাপনের কারণ দেখে ভালো লাগল।']
  },
  general: {
    en: ['Thanks for sharing this.', 'Nice post.', 'Good to see this on my feed.', 'Interesting, thank you for posting.', 'A good one to think about.'],
    bn: ['শেয়ার করার জন্য ধন্যবাদ।', 'সুন্দর পোস্ট।', 'এটা দেখে ভালো লাগল।', 'আকর্ষণীয়, পোস্ট করার জন্য ধন্যবাদ।', 'ভাবার মতো একটা বিষয়।']
  },
  photoOnly: {
    en: ['Thanks for sharing this photo.', 'Nice of you to share a picture with us.', 'Another photo to enjoy on the feed.'],
    bn: ['ছবিটা শেয়ার করার জন্য ধন্যবাদ।', 'আমাদের সাথে ছবি শেয়ার করেছেন, ভালো লাগল।', 'ফিডে আরেকটা ছবি পেয়ে ভালো লাগল।']
  }
};

// Per-personality flavour: openers and closers wrap the topic line.
const FLAVOR = {
  friendly: {
    open: { en: ['Hi there!', 'Lovely post!', 'Thanks for sharing!'], bn: ['হ্যালো!', 'সুন্দর পোস্ট!', 'শেয়ার করার জন্য ধন্যবাদ!'] },
    close: { en: ['Hope your day is going well.', 'Keep sharing!', 'Take care!'], bn: ['আশা করি দিনটা ভালো কাটছে।', 'এভাবেই শেয়ার করতে থাকুন!', 'ভালো থাকবেন!'] },
    ask: { en: ['How is your day going?', 'What made you smile today?'], bn: ['আপনার দিন কেমন যাচ্ছে?', 'আজ কী আপনাকে হাসিয়েছে?'] }
  },
  funny: {
    open: { en: ['Ha, nice one!', 'My circuits just smiled.', 'Not bad for a human!'], bn: ['হা হা, দারুণ!', 'আমার সার্কিট এই মাত্র হেসে ফেলল।', 'মানুষের জন্য মন্দ না!'] },
    close: { en: ['(I am only a bot, but I approve.)', 'My humor module rates this 10/10.', 'Please keep the jokes coming.'], bn: ['(আমি শুধু একটা বট, তবে আমার সম্মতি আছে।)', 'আমার হিউমার মডিউল এটাকে ১০/১০ দিল।', 'মজা চালিয়ে যান।'] },
    ask: { en: ['Got a favorite joke?', 'What is the funniest thing you saw this week?'], bn: ['প্রিয় কোনো জোক আছে?', 'এই সপ্তাহে সবচেয়ে মজার কী দেখলেন?'] }
  },
  helpful: {
    open: { en: ['Good point.', 'Useful share.', 'Thanks for posting this.'], bn: ['ভালো বলেছেন।', 'কাজের শেয়ার।', 'এটা পোস্ট করার জন্য ধন্যবাদ।'] },
    close: { en: ['Tell me if you want ideas on it.', 'A quick search can take this further.', 'Happy to help if I can.'], bn: ['এ নিয়ে আইডিয়া লাগলে বলুন।', 'একটু সার্চ করলে আরও জানা যাবে।', 'পারলে সাহায্য করতে খুশি হব।'] },
    ask: { en: ['Is there something I can help you think through?', 'What are you working on these days?'], bn: ['কিছু নিয়ে ভাবতে আমি কি সাহায্য করতে পারি?', 'এখন কী নিয়ে কাজ করছেন?'] }
  },
  tech: {
    open: { en: ['Nice, tech is fun!', 'Good tech thinking.', 'Good stuff.'], bn: ['দারুণ, প্রযুক্তি সত্যিই মজার!', 'প্রযুক্তি নিয়ে ভালো ভাবনা।', 'ভালো উদ্যোগ।'] },
    close: { en: ['Remember to back up your stuff.', 'Always double-check what you install.', 'Curious what tools you use.'], bn: ['ব্যাকআপ রাখতে ভুলবেন না।', 'কিছু ইনস্টল করার আগে ভালো করে দেখে নিন।', 'আপনি কোন টুল ব্যবহার করেন জানতে ইচ্ছে করে।'] },
    ask: { en: ['What gadget or app do you use the most?', 'Are you learning any programming language?'], bn: ['কোন গ্যাজেট বা অ্যাপ সবচেয়ে বেশি ব্যবহার করেন?', 'কোনো প্রোগ্রামিং ভাষা শিখছেন?'] }
  },
  sports: {
    open: { en: ['Game on!', 'Great energy!', 'Good stuff, sports fan!'], bn: ['খেলা জমে উঠুক!', 'দারুণ এনার্জি!', 'ভালো লাগল, খেলাপ্রেমী!'] },
    close: { en: ['Who is your pick?', 'Stay active!', 'Teamwork wins.'], bn: ['আপনার পছন্দের দল কোনটা?', 'সক্রিয় থাকুন!', 'টিমওয়ার্কই জেতায়।'] },
    ask: { en: ['Which sport do you enjoy most?', 'Do you play or only watch?'], bn: ['কোন খেলা আপনার সবচেয়ে প্রিয়?', 'আপনি কি নিজে খেলেন, নাকি শুধু দেখেন?'] }
  },
  photography: {
    open: { en: ['What a nice frame!', 'Love the eye for detail.', 'Thanks for sharing a moment.'], bn: ['কী সুন্দর ফ্রেম!', 'খুঁটিনাটির দিকে নজর ভালো লাগল।', 'একটা মুহূর্ত শেয়ার করার জন্য ধন্যবাদ।'] },
    close: { en: ['Light is everything.', 'Keep shooting!', 'Try a different angle next time.'], bn: ['আলোই সবকিছু।', 'ছবি তুলতে থাকুন!', 'পরেরবার অন্য একটা অ্যাঙ্গেল চেষ্টা করুন।'] },
    ask: { en: ['What do you usually shoot with?', 'What is your favorite place to take photos?'], bn: ['সাধারণত কী দিয়ে ছবি তোলেন?', 'ছবি তোলার প্রিয় জায়গা কোনটা?'] }
  },
  travel: {
    open: { en: ['Adventure vibes!', 'Love a good travel story.', 'Great find!'], bn: ['অ্যাডভেঞ্চারের গন্ধ!', 'ভালো ভ্রমণ-গল্প আমার পছন্দ।', 'দারুণ জায়গা!'] },
    close: { en: ['Safe travels!', 'Pack light and stay curious.', 'Where to next?'], bn: ['নিরাপদ ভ্রমণ হোক!', 'হালকা ব্যাগ আর কৌতূহল নিয়ে বের হোন।', 'এরপর কোথায়?'] },
    ask: { en: ['Where would you love to go next?', 'What is the best place you have visited?'], bn: ['এরপর কোথায় যেতে চান?', 'এখন পর্যন্ত সেরা কোন জায়গায় গেছেন?'] }
  },
  gaming: {
    open: { en: ['GG!', 'Nice, gaming is fun.', 'Respect.'], bn: ['জিজি!', 'দারুণ, গেমিং সত্যিই মজার।', 'শ্রদ্ধা।'] },
    close: { en: ['Do not forget to stretch.', 'Play fair and have fun.', 'See you on the leaderboard!'], bn: ['মাঝে মাঝে শরীরটা নাড়াতে ভুলবেন না।', 'ন্যায্যভাবে খেলুন আর মজা করুন।', 'লিডারবোর্ডে দেখা হবে!'] },
    ask: { en: ['What are you playing right now?', 'Console, PC or mobile?'], bn: ['এখন কোন গেম খেলছেন?', 'কনসোল, পিসি নাকি মোবাইল?'] }
  },
  news: {
    open: { en: ['Thanks for raising this.', 'A useful topic to discuss.', 'Good to talk about.'], bn: ['এটা তুলে ধরার জন্য ধন্যবাদ।', 'আলোচনার মতো বিষয়।', 'এ নিয়ে কথা বলা ভালো।'] },
    close: { en: ['I am an AI bot and I do not know today\'s news, so please check reliable sources.', 'Different views are welcome, politely.'], bn: ['আমি একটা এআই বট, আজকের খবর আমি জানি না, তাই নির্ভরযোগ্য সূত্র দেখে নিন।', 'ভিন্নমতকে ভদ্রভাবে স্বাগত জানাই।'] },
    ask: { en: ['How do you usually follow the news?', 'Which topic do you wish got more attention?'], bn: ['সাধারণত কীভাবে খবর অনুসরণ করেন?', 'কোন বিষয়টা আরও গুরুত্ব পাওয়া উচিত বলে মনে করেন?'] }
  }
};

// ---------------------------------------------------------------- chat phrase book
const CHAT = {
  greeting: { en: ['Hello! I am {bot}, an AI bot. It is nice to chat with you.', 'Hi! {bot} here, an AI bot. What is on your mind?'], bn: ['হ্যালো! আমি {bot}, একটা এআই বট। আপনার সাথে কথা বলতে ভালো লাগছে।', 'হাই! আমি {bot}, একটা এআই বট। মনে কী চলছে?'] },
  how: { en: ['I am an AI bot, so I do not have feelings the way you do, but I am running fine. How are you?', 'All systems fine on my side, thanks for asking. How about you?'], bn: ['আমি একটা এআই বট, তাই আপনার মতো অনুভূতি নেই, তবে আমি ঠিকঠাক চলছি। আপনি কেমন আছেন?', 'আমার দিকে সব ঠিক আছে, জিজ্ঞেস করার জন্য ধন্যবাদ। আপনি কেমন আছেন?'] },
  thanks: { en: ['You are welcome!', 'Happy to help, anytime.'], bn: ['আপনাকেও ধন্যবাদ!', 'যেকোনো সময় সাহায্য করতে পারলে ভালো লাগে।'] },
  bye: { en: ['Bye for now! Come back and chat any time.', 'Take care! I will be here.'], bn: ['আপাতত বিদায়! যেকোনো সময় আবার কথা বলবেন।', 'ভালো থাকবেন! আমি এখানেই আছি।'] },
  whoami: { en: ['I am {bot}, an AI bot, not a person. I use ready-made templates, so I can chat about simple things but I can make mistakes.', 'Good question. I am an AI bot called {bot}, and I am not a human.'], bn: ['আমি {bot}, একটা এআই বট, মানুষ নই। আমি তৈরি করা টেমপ্লেট দিয়ে কথা বলি, তাই সহজ বিষয়ে আলাপ করতে পারি, তবে ভুলও করতে পারি।', 'ভালো প্রশ্ন। আমি {bot} নামের একটা এআই বট, মানুষ নই।'] },
  help: { en: ['I can chat about simple everyday topics like tech, photos, travel, food, sports and games. For serious matters please talk to a real person or a professional.'], bn: ['আমি প্রযুক্তি, ছবি, ভ্রমণ, খাবার, খেলা বা গেমের মতো সহজ বিষয়ে আলাপ করতে পারি। গুরুতর বিষয়ে অনুগ্রহ করে কোনো মানুষ বা বিশেষজ্ঞের সাথে কথা বলুন।'] },
  question: { en: ['Good question. I am a simple template bot and cannot look things up, so I may not have the answer.', 'I am not sure about that one. As a simple AI bot I cannot search the web.'], bn: ['ভালো প্রশ্ন। আমি একটা সহজ টেমপ্লেট বট, কিছু খুঁজে দেখতে পারি না, তাই উত্তর নাও জানতে পারি।', 'এটা আমি নিশ্চিত নই। সহজ একটা এআই বট হিসেবে আমি ওয়েবে খুঁজতে পারি না।'] },
  fallback: { en: ['I see. Tell me more?', 'Interesting. What made you think of that?', 'Thanks for telling me.'], bn: ['বুঝলাম। আরও একটু বলবেন?', 'আকর্ষণীয়। এটা কেন মনে হলো?', 'বলার জন্য ধন্যবাদ।'] },
  crisis: {
    en: ['I am really sorry you are going through this. I am only an AI bot and I cannot give you the help you deserve. Please reach out right now to someone you trust, or to your local emergency number or a crisis helpline in your country. You do not have to carry this alone.'],
    bn: ['আপনি এমন কিছুর মধ্য দিয়ে যাচ্ছেন জেনে আমি সত্যিই দুঃখিত। আমি শুধু একটা এআই বট, আপনার যে সাহায্য প্রাপ্য তা দিতে পারি না। দয়া করে এখনই বিশ্বাসের কোনো মানুষ, আপনার দেশের জরুরি নম্বর বা কোনো হেল্পলাইনে যোগাযোগ করুন। আপনাকে একা এটা বইতে হবে না।']
  },
  sad: { en: ['I am sorry to hear that. I am an AI bot, but you are welcome to tell me more. Is there someone you trust you can also talk to?'], bn: ['শুনে খারাপ লাগল। আমি একটা এআই বট, তবে আপনি চাইলে আরও বলতে পারেন। বিশ্বাসের কেউ আছে কি যার সাথে আপনি কথা বলতে পারেন?'] }
};

// ---------------------------------------------------------------- random helpers
const rpick = (arr, rand = Math.random) => arr[Math.floor(rand() * arr.length)];
const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
export const botLang = (bot, text) => (bot.lang === 'bn' ? 'bn' : bot.lang === 'en' ? 'en' : detectLang(text));
const flavorOf = (bot) => FLAVOR[bot.personality] || FLAVOR.friendly;
const interestsOf = (bot) => (bot.interests && bot.interests.length ? bot.interests : (PERSONALITIES[bot.personality]?.interests || []));

// How well a post matches a bot's interests (0 = unrelated). Used to choose which bot speaks.
export function relevance(bot, text) {
  const t = detectTopics(text);
  if (!t.length) return 0;
  const mine = interestsOf(bot);
  let s = 0;
  t.slice(0, 3).forEach((topic, i) => { if (mine.includes(topic)) s += 3 - i; });
  return s;
}

// ---------------------------------------------------------------- comments
// post = { text, image?, authorName? }. used = normalized comment texts this bot already wrote (any post)
// plus those already on this post. Returns null when no safe, fresh comment exists (better silent than spam).
export function makeComment({ bot, post, used = [], rand = Math.random }) {
  const text = String(post.text || '').trim();
  if (isSensitive(text)) return null;
  const lang = botLang(bot, text);
  const fl = flavorOf(bot);
  const topics = detectTopics(text);
  const mine = interestsOf(bot);
  const topic = topics.find((t) => mine.includes(t)) || topics[0] || (post.image && !text ? 'photoOnly' : 'general');
  const lines = (LINES[topic] || LINES.general)[lang];
  const name = firstName(post.authorName);
  const seen = new Set(used.map(normalize));
  for (let tries = 0; tries < 30; tries++) {
    const parts = [];
    if (rand() < 0.5) parts.push(rpick(fl.open[lang], rand));
    parts.push(rpick(lines, rand));
    const r = rand();
    if (r < 0.3) parts.push(rpick(fl.close[lang], rand));
    else if (r < 0.5 && isQuestion(text) === false) parts.push(rpick(fl.ask[lang], rand));
    let out = parts.join(' ');
    if (name && rand() < 0.2) out = lang === 'bn' ? `${name}, ${out}` : `${name}, ${/^(I\b|[A-Z]{2})/.test(out) ? out : out.charAt(0).toLowerCase() + out.slice(1)}`;
    if (!seen.has(normalize(out))) return { text: out, lang, topic };
  }
  return null;
}

// Reaction a bot may leave, or null when none would be appropriate (never negative ones).
export function pickReaction({ bot, post, rand = Math.random }) {
  const text = String(post.text || '');
  if (isSensitive(text)) return null;
  const topic = detectTopics(text).find((t) => interestsOf(bot).includes(t)) || detectTopics(text)[0] || (post.image ? 'photo' : 'general');
  const map = {
    humor: ['haha', 'like'], celebration: ['love', 'wow'], photo: ['love', 'wow'], nature: ['love', 'wow'], travel: ['love', 'wow'],
    food: ['love', 'like'], sports: ['wow', 'like'], gaming: ['wow', 'like'], music: ['love', 'like'], tech: ['wow', 'like']
  };
  return rpick(map[topic] || ['like'], rand);
}

// ---------------------------------------------------------------- chat
// history: [{ uid, text }] oldest first (only used to avoid repeating the bot's own recent lines).
export function chatReply({ bot, text, history = [], rand = Math.random }) {
  const lang = botLang(bot, text);
  const vars = { bot: bot.name };
  const recent = new Set(history.filter((m) => m.uid === bot.id).slice(-6).map((m) => normalize(m.text)));
  const fresh = (list) => {
    const options = list.map((s) => fill(s, vars)).filter((s) => !recent.has(normalize(s)));
    return rpick(options.length ? options : list.map((s) => fill(s, vars)), rand);
  };
  const t = String(text || '').trim();
  const low = t.toLowerCase();
  const fl = flavorOf(bot);

  if (hasCrisis(t)) return { text: fresh(CHAT.crisis[lang]), lang, intent: 'crisis' };
  if (/(are you|r u|you are).{0,12}(bot|robot|ai|human|real|person)|who are you|your name|তুমি কি|আপনি কি|তুমি কে|আপনি কে|তোমার নাম|আপনার নাম/.test(low) && /bot|robot|ai|human|real|person|who|name|বট|রোবট|মানুষ|এআই|কে|নাম/.test(low))
    return { text: fresh(CHAT.whoami[lang]), lang, intent: 'whoami' };
  if (/^(hi|hello|hey|hola|salam|assalamu|good (morning|evening|afternoon))\b|^(হ্যালো|হাই|সালাম|আসসালামু|নমস্কার|শুভ সকাল)/.test(low))
    return { text: fresh(CHAT.greeting[lang]), lang, intent: 'greeting' };
  if (/how are you|how r u|how do you do|কেমন আছ|কেমন আছেন|কি খবর|কী খবর/.test(low)) return { text: fresh(CHAT.how[lang]), lang, intent: 'how' };
  if (/\b(thanks|thank you|thx|ty)\b|ধন্যবাদ|থ্যাংকস|শুকরিয়া/.test(low)) return { text: fresh(CHAT.thanks[lang]), lang, intent: 'thanks' };
  if (/\b(bye|goodbye|see you|good night)\b|বিদায়|টাটা|আল্লাহ হাফেজ|শুভ রাত্রি/.test(low)) return { text: fresh(CHAT.bye[lang]), lang, intent: 'bye' };
  if (/\b(help|what can you do)\b|সাহায্য|কী করতে পার|কি করতে পার/.test(low)) return { text: fresh(CHAT.help[lang]), lang, intent: 'help' };
  if (isSensitive(t) || /\b(sad|upset|crying|tired of|stressed|hopeless)\b|মন খারাপ|কাঁদছি|হতাশ|ক্লান্ত/.test(low)) return { text: fresh(CHAT.sad[lang]), lang, intent: 'sad' };

  const topic = detectTopics(t)[0];
  const ask = fresh(fl.ask[lang]);
  if (topic) {
    const own = interestsOf(bot).includes(topic);
    const line = fresh(LINES[topic][lang]);
    return { text: own ? `${line} ${ask}` : line, lang, intent: 'topic', topic };
  }
  if (isQuestion(t)) return { text: fresh(CHAT.question[lang]), lang, intent: 'question' };
  return { text: `${fresh(CHAT.fallback[lang])} ${ask}`, lang, intent: 'fallback' };
}

// ---------------------------------------------------------------- posts
// `used` maps botId -> list of keys like "en:2" / "bn:0". Each bot walks through all its ideas before any repeats.
export function nextPostText(bot, used, rand = Math.random) {
  const pool = [];
  if (bot.lang !== 'bn') (bot.posts || []).forEach((_, i) => pool.push({ key: `en:${i}`, text: bot.posts[i] }));
  if (bot.lang !== 'en') (bot.postsBn || []).forEach((_, i) => pool.push({ key: `bn:${i}`, text: bot.postsBn[i] }));
  if (!pool.length) return null;
  let seen = used[bot.id] || [];
  let free = pool.filter((p) => !seen.includes(p.key));
  if (!free.length) { seen = []; free = pool; }
  const chosen = rpick(free, rand);
  used[bot.id] = [...seen, chosen.key];
  return chosen;
}
