import { verseForms } from './verse-forms.js';

// Quran.com Arabic excerpts with short study translations in Russian and English.
// A name ID before a slash selects a different passage within the same verse.
const passages = `
1:3|الرَّحْمَٰنِ الرَّحِيمِ|Милостивому, Милосердному.|The All-Merciful, the Merciful.
59:22|هُوَ الرَّحْمَٰنُ الرَّحِيمُ|Он — Милостивый, Милосердный.|He is the All-Merciful, the Merciful.
33:43|وَكَانَ بِالْمُؤْمِنِينَ رَحِيمًا|Он милосерден к верующим.|He is merciful to the believers.
7:180|وَلِلَّهِ الْأَسْمَاءُ الْحُسْنَىٰ فَادْعُوهُ بِهَا|Аллаху принадлежат прекраснейшие имена. Обращайтесь к Нему, называя Его этими именами.|The most beautiful names belong to Allah. Call upon Him by those names.
3:6|هُوَ الَّذِي يُصَوِّرُكُمْ فِي الْأَرْحَامِ كَيْفَ يَشَاءُ|Он придаёт вам облик в утробах, как пожелает.|He shapes you in the wombs as He wills.
19/35:2|مَّا يَفْتَحِ اللَّهُ لِلنَّاسِ مِن رَّحْمَةٍ فَلَا مُمْسِكَ لَهَا|Какую бы милость Аллах ни даровал людям, никто не сможет ей воспрепятствовать.|Whatever mercy Allah opens to people, no one can withhold it.
90/35:2|وَمَا يُمْسِكْ فَلَا مُرْسِلَ لَهُ مِن بَعْدِهِ|А то, что Он удержит, никто другой не сможет даровать.|What He withholds, no one after Him can release.
2:245|وَاللَّهُ يَقْبِضُ وَيَبْسُطُ|Аллах сужает и расширяет удел.|Allah restricts and expands provision.
3:26|اللَّهُمَّ مَالِكَ الْمُلْكِ تُؤْتِي الْمُلْكَ مَن تَشَاءُ وَتَنزِعُ الْمُلْكَ مِمَّن تَشَاءُ وَتُعِزُّ مَن تَشَاءُ وَتُذِلُّ مَن تَشَاءُ|О Аллах, Владыка всех царств! Ты даруешь власть тому, кому пожелаешь, и отнимаешь её у того, у кого пожелаешь. Ты даруешь почёт тому, кому пожелаешь, и унижаешь того, кого пожелаешь.|O Allah, Owner of all dominion! You grant and take away authority as You will. You honor and humble whom You will.
58:11|يَرْفَعِ اللَّهُ الَّذِينَ آمَنُوا مِنكُمْ وَالَّذِينَ أُوتُوا الْعِلْمَ دَرَجَاتٍ|Аллах возвысит на несколько ступеней тех из вас, кто уверовал, и тех, кому даровано знание.|Allah will raise believers among you and those granted knowledge in rank.
6:83|نَرْفَعُ دَرَجَاتٍ مَّن نَّشَاءُ|Мы возвышаем на несколько ступеней тех, кого пожелаем.|We raise whom We will in degrees.
6:115|وَتَمَّتْ كَلِمَتُ رَبِّكَ صِدْقًا وَعَدْلًا|В слове твоего Господа — совершенная истина и справедливость.|Your Lord’s word is complete in truth and justice.
4:40|إِنَّ اللَّهَ لَا يَظْلِمُ مِثْقَالَ ذَرَّةٍ|Аллах ни с кем не поступает несправедливо, даже в самой малой мере.|Allah does not wrong anyone by even a speck’s weight.
55:26|كُلُّ مَنْ عَلَيْهَا فَانٍ|Все, кто на земле, смертны.|Everyone on earth will pass away.
55:27|وَيَبْقَىٰ وَجْهُ رَبِّكَ ذُو الْجَلَالِ وَالْإِكْرَامِ|И пребудет Лик твоего Господа, исполненный величия и великодушия.|The Face of your Lord, Possessor of majesty and honor, will remain.
55:78|ذِي الْجَلَالِ وَالْإِكْرَامِ|Обладающего величием и великодушием.|Possessor of majesty and honor.
2:186|أُجِيبُ دَعْوَةَ الدَّاعِ إِذَا دَعَانِ|Я отвечаю на мольбу того, кто обращается ко Мне.|I answer the prayer of the one who calls on Me.
22:7|وَأَنَّ اللَّهَ يَبْعَثُ مَن فِي الْقُبُورِ|Аллах воскресит тех, кто в могилах.|Allah will raise those in the graves.
72:28|وَأَحْصَىٰ كُلَّ شَيْءٍ عَدَدًا|Он всё пересчитал в точности.|He has taken exact count of everything.
85:13|إِنَّهُ هُوَ يُبْدِئُ وَيُعِيدُ|Именно Он даёт начало творению и воссоздаёт его.|It is He who begins creation and brings it back.
10:34|اللَّهُ يَبْدَأُ الْخَلْقَ ثُمَّ يُعِيدُهُ|Аллах даёт начало творению, а затем воссоздаёт его.|Allah begins creation and then brings it back.
30:50|كَيْفَ يُحْيِي الْأَرْضَ بَعْدَ مَوْتِهَا|Как Он оживляет землю после её смерти.|How He gives life to the earth after its death.
41:39|إِنَّ الَّذِي أَحْيَاهَا لَمُحْيِي الْمَوْتَىٰ|Воистину, Тот, Кто оживил её, оживит и мёртвых.|The One who revived it will surely revive the dead.
15:23|وَإِنَّا لَنَحْنُ نُحْيِي وَنُمِيتُ وَنَحْنُ الْوَارِثُونَ|Мы даём жизнь и лишаем её. Мы — наследники.|We give life and cause death, and We are the inheritors.
57:2|يُحْيِي وَيُمِيتُ|Он даёт жизнь и лишает её.|He gives life and causes death.
57:3|هُوَ الْأَوَّلُ وَالْآخِرُ وَالظَّاهِرُ وَالْبَاطِنُ|Он — Первый и Последний, Явный и Сокровенный.|He is the First and the Last, the Manifest and the Hidden.
13:2|يُدَبِّرُ الْأَمْرَ|Он управляет делами.|He directs all affairs.
13:9|الْكَبِيرُ الْمُتَعَالِ|Великий, Превознесённый.|The Great, the Exalted above all.
32:22|إِنَّا مِنَ الْمُجْرِمِينَ مُنتَقِمُونَ|Мы воздадим тем, кто совершал зло.|We will exact retribution from wrongdoers.
3:4|وَاللَّهُ عَزِيزٌ ذُو انتِقَامٍ|Аллах могуществен и воздаёт за зло.|Allah is mighty and exercises retribution.
3:18|قَائِمًا بِالْقِسْطِ|Поддерживая справедливость.|Upholding justice.
21:47|وَنَضَعُ الْمَوَازِينَ الْقِسْطَ لِيَوْمِ الْقِيَامَةِ فَلَا تُظْلَمُ نَفْسٌ شَيْئًا|В День воскресения Мы установим справедливые весы. Ни с кем не поступят несправедливо.|We will set up just scales for Resurrection Day. No soul will be wronged.
53:48|وَأَنَّهُ هُوَ أَغْنَىٰ وَأَقْنَىٰ|Он дарует богатство и достаток.|He grants wealth and sufficiency.
91/10:107|وَإِن يَمْسَسْكَ اللَّهُ بِضُرٍّ فَلَا كَاشِفَ لَهُ إِلَّا هُوَ|Если Аллах пошлёт тебе беду, никто, кроме Него, не сможет её отвести.|If Allah touches you with hardship, He alone can remove it.
92/10:107|وَإِن يُرِدْكَ بِخَيْرٍ فَلَا رَادَّ لِفَضْلِهِ|Если Он пожелает тебе блага, никто не сможет отвратить Его милость.|If He wills good for you, no one can turn away His bounty.
19:40|إِنَّا نَحْنُ نَرِثُ الْأَرْضَ وَمَنْ عَلَيْهَا وَإِلَيْنَا يُرْجَعُونَ|Мы наследуем землю и тех, кто на ней. К Нам они будут возвращены.|We inherit the earth and those on it, and to Us they will return.
18:10|وَهَيِّئْ لَنَا مِنْ أَمْرِنَا رَشَدًا|Направь наше дело к верному исходу.|Prepare a right course for us in our affair.
59:24|هُوَ اللَّهُ الْخَالِقُ الْبَارِئُ الْمُصَوِّرُ|Он — Аллах, Творец, Который даёт творениям бытие и наделяет их обликом.|He is Allah, the Creator, the Bringer into Being, the Fashioner of Forms.
9/59:24,47/59:24|وَهُوَ الْعَزِيزُ الْحَكِيمُ|Он — Непобедимый, Премудрый.|He is the Almighty, the All-Wise.
34:26|ثُمَّ يَفْتَحُ بَيْنَنَا بِالْحَقِّ وَهُوَ الْفَتَّاحُ الْعَلِيمُ|Затем Он по справедливости рассудит нас. Он — Тот, Кто выносит решение и знает всё.|Then He will judge between us in truth. He is the Decider, the All-Knowing.
11:61|إِنَّ رَبِّي قَرِيبٌ مُّجِيبٌ|Мой Господь близок и отвечает на мольбы.|My Lord is near and answers prayers.
85:14|وَهُوَ الْغَفُورُ الْوَدُودُ|Он много прощает и любит.|He is the Abundantly Forgiving, the Loving.
51:58|إِنَّ اللَّهَ هُوَ الرَّزَّاقُ ذُو الْقُوَّةِ الْمَتِينُ|Поистине, Аллах дарует удел. Его сила непоколебима.|Allah is the Provider, the Possessor of strength, the Firm in Strength.
25:58|وَتَوَكَّلْ عَلَى الْحَيِّ الَّذِي لَا يَمُوتُ|Уповай на Живого, Который не умирает.|Put your trust in the Living One who never dies.
52:28|إِنَّهُ هُوَ الْبَرُّ الرَّحِيمُ|Он — Благодетельный, Милосердный.|He is the Beneficent, the Merciful.
4:43|إِنَّ اللَّهَ كَانَ عَفُوًّا غَفُورًا|Аллах милует и много прощает.|Allah pardons and forgives abundantly.
9:117|إِنَّهُ بِهِمْ رَءُوفٌ رَّحِيمٌ|Он сострадателен и милосерден к ним.|He is compassionate and merciful toward them.
3:9|رَبَّنَا إِنَّكَ جَامِعُ النَّاسِ لِيَوْمٍ لَّا رَيْبَ فِيهِ|Господь наш, Ты соберёшь людей в День, в котором нет сомнения.|Our Lord, You will gather people for a Day beyond doubt.
2:117|بَدِيعُ السَّمَاوَاتِ وَالْأَرْضِ|Создатель небес и земли, сотворивший их без образца.|Originator of the heavens and the earth without precedent.
6:101|بَدِيعُ السَّمَاوَاتِ وَالْأَرْضِ|Создатель небес и земли, сотворивший их без образца.|Originator of the heavens and the earth without precedent.
2:255|وَهُوَ الْعَلِيُّ الْعَظِيمُ|Он — Всевышний, Величайший.|He is the Most High, the Magnificent.
63/2:255,64/2:255|اللَّهُ لَا إِلَٰهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ|Аллах — Тот, кроме Кого нет божества, достойного поклонения. Он жив вечно и поддерживает всё сущее.|Allah, there is no deity worthy of worship but Him, the Ever-Living, the Sustainer of all.
2:261|وَاللَّهُ وَاسِعٌ عَلِيمٌ|Аллах — Всеобъемлющий, Всезнающий.|Allah is the All-Encompassing, the All-Knowing.
52/22:62|ذَٰلِكَ بِأَنَّ اللَّهَ هُوَ الْحَقُّ وَأَنَّ مَا يَدْعُونَ مِن دُونِهِ هُوَ الْبَاطِلُ|Это потому, что Аллах — Истина, а то, к чему взывают помимо Него, — ложь.|That is because Allah is the Truth, and what they invoke besides Him is false.
24:35|اللَّهُ نُورُ السَّمَاوَاتِ وَالْأَرْضِ|Аллах — Свет небес и земли.|Allah is the Light of the heavens and the earth.
2:163|وَإِلَٰهُكُمْ إِلَٰهٌ وَاحِدٌ|Ваш Бог един.|Your God is one God.
112:2|اللَّهُ الصَّمَدُ|Аллах ни в ком не нуждается, и все нуждаются в Нём.|Allah is the One on whom all depend.
2:54|إِلَىٰ بَارِئِكُمْ|К вашему Создателю.|To your Creator.
`;

const phrases = new Map(passages.trim().split('\n').flatMap(row => {
  const [keys, ar, ru, en] = row.split('|');
  const phrase = { ar, meaning: [ru, en] };
  return keys.split(',').map(key => [key, phrase]);
}));

export function verseExcerpt(name, label) {
  const specific = name && phrases.get(`${name.id}/${label}`);
  const shared = specific || phrases.get(label);
  if (shared) return shared;
  const ar = name && verseForms[name.id]?.[label];
  return ar ? { ar, meaning: name.meaning } : undefined;
}
