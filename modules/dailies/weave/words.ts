/**
 * Weave's words: everyday English words of 4 to 6 letters.
 *
 * Built from the 10,000 most common US English words with swears removed
 * (github.com/first20hours/google-10000-english,
 * google-10000-english-usa-no-swears.txt), keeping those in the system
 * dictionary (/usr/share/dict/american-english) that are not also listed
 * capitalised - which drops most names - and not on a short blocklist of
 * shorthand and words unwelcome in a daily puzzle. 2920 words.
 *
 * To change the list, edit the text below; one word per space.
 */
const LIST = `
able about above abroad absent accent accept access acid acids acne acre acres across acting
action active actor actors actual acute added adding adds adjust admin admit adobe adopt adult
adults advert advice advise adware aerial affair affect afford afraid after again aged agency
agenda agent agents ages aging agree agreed agrees ahead aids aimed aims alarm album albums
alert alerts alias alien align alike alive allied allow allows alloy almost alone along alpha
also alter alto alumni always amend amino among amount analog anchor angels anger angle angry
animal anime annex annual answer anti anyone anyway apart appeal appear apply approx apps aqua
arbor arcade arch area areas arena argue argued arise armed armor arms army around array arrest
arrive arrow artist arts aside asked asking asks aspect assess asset assets assign assist
assume assure asthma asylum atom atomic attach attack attend audio audit author auto autos
avatar avenue avoid award awards aware away awful axis babe babes babies baby back backed
backup badge badly bags baking bald ballet ballot banana band bands bang bank banned banner
bare barely barn barrel bars base based bases basic basics basin basis basket batch bath baths
beads beam beans bear bears beast beat beats beauty beaver became become beds beef been before
began begins begun behalf behind being beings belief belle belly belong below belt belts bench
bent beside beta better beyond bias bidder bids bigger bike bikes bikini bills binary bind
bingo birds birth bite bits blade blades blah blame blank blast blend bless blind blink block
blocks blog blogs blond blonde blood blow blue blues board boards boat boats bodies body bold
bolt bonds bone bones bonus book books boom boost boot boots border bored boring boss both
bother bottle bottom bought bound bowl boxed boxes boxing boys brake brakes brand brands bras
brass brave breach bread break breaks breath breed breeds brick bridal bride bridge brief
briefs bring brings broad broke broken broker bronze brook browse brush brutal bubble bucks
budget buffer bugs build builds built bulk bull bullet bumper bunch bundle bunny burden bureau
buried burn burner burst buses busy butter button butts buyer buyers buying buys buzz byte
bytes cabin cable cables cache cached cake cakes call called calls calm came camera camp camps
campus cams canal cancel candle cant canvas canyon cape caps carbon card cards care career
cargo caring carpet carry cars cart cases cast castle casual catch cats cattle caught cause
caused causes cave cedar cell cells cement census cent center cents chain chains chair chairs
change chaos chapel char charge charm charms chart charts chat cheap cheat cheats check checks
cheers cheese chef chem chess chest chick chicks chief child chip chips choice choir choose
chorus chose chosen chrome chubby cinema circle circus cite cited cities city civic civil claim
claims clan class clause clean clear clerk click clicks client climb clinic clip clips clock
clocks clone close closed closer closes cloth cloud clouds cloudy club clubs coach coal coast
coat coated code codes coding coffee coin coins cold collar colony color colors column combat
combo come comedy comes comic comics coming commit common comply condo condos cons cooked
cookie cool cooler cope copied copies copper copy coral cord core cork corn corner corps corpus
cost costs could count counts county couple coupon course court courts cove cover covers cowboy
crack cradle crafts crash crazy cream create credit crew crisis crop crops crowd crown crude
cube cubic cult cups cure cursor curve curves custom cute cuts cycle cycles daddy daily dairy
damage dame dance danger dark dash data date dated dates dating days deadly deaf deal dealer
deals dealt dear deaths debate debt debug debut decade decent decide deck decor deemed deep
deeper deeply deer defeat defend define degree delay delays delete deluxe demand demo denial
denied dense dental deny depend depot dept depth deputy desert design desire desk detail detect
device devil dialog diary dice died dies diet diff differ diffs digest digit dining dinner
direct dirt dirty disc disco discs dish dishes disk disks dive divide divine diving dock docs
does dogs doing doll dollar dolls domain dome donate done donor donors doom door doors dosage
dose double doubt down dozen dozens draft drag dragon drain drama draw drawn draws dream dreams
dress dried drill drink drinks drive driven driver drives drop drops drove drum drums drunk
dryer dual duck dude dumb dump during dust duties duty dying each eagle eagles early earn
earned ears ease easier easily easy eating echo edge edges edit edited editor effect effort
eggs eight either elder elect eleven elite else email emails empire employ empty enable ended
ending ends enemy energy engage engine enjoy enough ensure enter enters entire entity entry
enzyme epic equal equity error errors escape essay essays estate ethics ethnic euro euros even
event events ever every evil exact exam exams exceed excel except excess excuse exempt exist
exists exit exotic expand expect expert expo export extend extent extra extras eyed eyes fabric
face faced faces facial facing fact factor facts fail failed fails fair fairly fairy fake fall
fallen falls false fame family famous fancy fans fare fares farm farms fast faster fatal fate
fatty fault favor favors fear fears feat feed feeds feel feels fees feet fell fellow felt
female fence ferry fever fewer fiber field fifth fifty fight figure file filed files filing
fill filled film films filter final finals find finder finds fine finest finger finish finite
fire fired fires firm firms first fiscal fish fist fits fitted five fixed fixes flag flags
flame flash flat flavor fleece fleet flesh flex flight flip float flood floor floors floppy
floral flour flow flower flows fluid flush flux flyer flying foam focal focus fold folder folk
folks follow font fonts food foods fool foot force forced forces forge forget forgot fork form
formal format formed former forms fort forth forty forum forums fossil fought foul found four
fourth frame framed frames fraud free freely freeze fresh fridge friend frog from front frozen
fruit fruits fuel full fully fund funded funds funk funky funny fusion future fuzzy gain gained
gains galaxy game games gaming gamma gang gaps garage garden garlic gate gather gauge gave gays
gear geek gender genes genius genome genre genres gentle gently gets ghost giant giants gift
gifts girl girls give given gives giving glad glance global globe glory gloves glow gnome goal
goals goat gods goes going gold golf gone goods gossip gotten grab grad grade grades grain
grams grand granny grants graph graphs gratis grave great grew grid grill grip groove ground
group groups grove grow grown grows growth guard guards guess guest guests guide guided guides
guild guilty guitar gulf guru guys habits hack hacker hair hairy half halo hammer hand handed
handle hands hang happen happy harbor hard harder hardly harm hash hate hats have haven having
hawk hazard headed header heads health hear heard heart hearts heat heated heater heaven heavy
heel height held hello helmet help helped helps hence herald herb herbal herbs here hereby
herein hero heroes hidden hide high higher highly highs hiking hills hint hints hire hired
hiring hits hobby hockey hold holds hole holes hollow holy home homes honest honey honor honors
hook hoped hopes hoping horror horse horses hose host hosted hostel hosts hotel hotels hour
hourly hours houses huge human humans humor hunger hungry hurt hybrid icon icons idea ideal
ideas idle idol ignore image images immune impact import impose inbox inch inches income indeed
index indoor infant info inform injury inline inner inns input inputs insert inside intake
intend intent inter into intro invest invite iron island isle issue issued issues italic item
items itself jacket jade jail jazz jeans jets join joined joins joint joke jokes judge judges
juice jump jungle junk jury just karma keen keep keeps kept kernel keys kick kidney kids kind
kinda kinds kings kiss kits knee knew knife knit knives knock know known knows label labels
labor labs lace lack ladder laden ladies lady laid lake lakes lambda lamp lamps lands lanes
laptop large larger laser last late lately later latest latex latter laugh launch lawn laws
lawyer layer layers layout lazy lead leader leads leaf league learn lease least leave leaves
legacy legal legend legs lemon lender length lens lenses less lesser lesson lets letter level
levels liable lies life lift light lights like liked likely likes lime limit limits line linear
lined lines link linked links lion lions lips liquid list listed listen lists lite live lived
liver lives living load loaded loads loan loans lobby local locale locate lock locked locks
logged logic login logo logos logs lone lonely longer look looked looks lookup loop loops loose
lose losing loss losses lost lots lotus loud lounge loved lovely lover lovers loves loving
lower lowest lows luck lucky lunch lung luxury lying lyric lyrics macro made magic magnet
maiden mail mailed mails main mainly make maker makers makes makeup making males mall mambo
manage manga manner manor manual many maple maps marble margin marked marker market mart marvel
mask master match mate math mating matrix mats matter mature maybe mayor meal meals mean means
meant meat medal median medium meet meets member memo memory mental mentor menu menus mercy
mere merely merge merger merit merry mesh mess meta metal metals meter meters method metric
metro mice middle might mighty mild mile milk mime mind minds mine mines mini mining minor mint
minus minute mirror misc missed mixed mixer mixing mode model models modem modems modern modes
modify mods module mold moment moms money monkey mono month months mood moral most mostly motel
motels mother motion motor motors mounts mouse mouth move moved movers moves movie movies
moving much multi muscle museum music must mutual myself myth nail nails name named namely
names narrow nasty native nature naval navy near nearby nearly neck need needed needle needs
neon nerve nest nested neural never newbie newer newest newly news next nickel night nights
nine nobody node nodes noise none noon norm nose note noted notes notice notify notion novel
novels nudist nuke null number nurse nurses nuts nylon oaks oasis object obtain occur occurs
ocean odds offer offers office offset often oils okay older oldest omega once ones online only
onto oops open opened opens opera optics option oral orbit order orders organ origin other
others ought ours outer outlet output oval oven over owned owner owners owns oxide oxygen ozone
pack packed packet packs pads pages paid pain paint pair pairs palace pale palm panel panels
panic pants paper papers parade parcel parent parish part partly parts party pass passed passes
past pasta paste pastor patch patent path paths patio patrol payday paying pays peak peas
peeing peer peers pencil pens people pepper period permit person pest petite pets phase phases
phone phones photo photos phrase piano pick picked picks pickup picnic piece pieces pill pillow
pills pilot pine ping pink pins pipe pipes pitch pixel pixels pizza place placed places plain
plains plan plane planes planet plans plant plants plasma plate plates play played player plays
plaza please pledge plenty plot plots plug plugin plus pocket poem poems poet poetry point
points poison polar police policy poll polls pond pool pools poor pork port portal ports pose
posing postal posted poster posts potato pounds pour powder power praise pray prayer prefer
prefix prep press pretty priced prices pride priest prime print prints prior prison prize
prizes probe profit promo prompt proof proper pros proud prove proved proven proxy public pubs
pull pulled pulse pump pumps punk pupils puppy pure purple purse pursue push pushed puts puzzle
quad query quest queue quick quiet quilt quit quite quiz quote quoted quotes rabbit race races
racial racing rack racks radar radio radios radius rage raid rail rain raise raised raises
rally ranch random range ranger ranges rank ranked ranks rapid rapids rare rarely rate rated
rates rating ratio ratios rats rays reach read reader reads ready real really realm realty rear
reason rebate rebel recall recent recipe record redeem reduce reef reel refer refers refine
reform refund refuse regard reggae regime region rehab reject relate relax relay relief reload
rely remain remark remedy remind remote remove render renew rent rental repair repeat reply
report rescue reset resist resort rest result resume retail retain return reveal review reward
rhythm ribbon rider riders rides ridge riding right rights ring rings ripe rise rising risk
risks river road roads robot robots robust rocket rocks role roles roll rolled roller rolls
roof room rooms roots rope roses roster rotary rouge rough round rounds route router routes
rows rubber rugby rugs rule ruled rules ruling runner runs rural sacred safari safe safely
safer safety sage said sail saint saints sake salad salary sale sales salmon salon salt samba
same sample sans satin sauce save saved saver saves saving saying says scale scales scan scared
scary scene scenes scenic schema scheme school scoop scope score scored scores screen screw
script scroll scuba seal sealed search seas season seat seats second secret sector secure seed
seeds seeing seek seeker seeks seem seemed seems seen sees select self sell seller sells semi
send sender sends sense sensor sent serial series serum serve served server serves sets settle
setup seven severe sewing shade shades shadow shaft shake shall shame shape shaped shapes share
shared shares shark shaved shed sheep sheer sheet sheets shelf shield shift shine ship ships
shirt shirts shock shoe shoes shoot shop shops shore shorts shot shots should show showed
shower shown shows shut sick side sides sierra sight sigma sign signal signed signs silent silk
silly silver simple simply since sing single sink site sites sixth size sized sizes skiing
skill skills skin skins skip skirt skirts slave sleep sleeps sleeve slide slides slight slim
slip slope slot slots slow slowly smart smell smile smoke smooth snap soap soccer social socket
socks sodium sofa soft soil solar sold sole solely solid solo solve solved some song songs
sonic sons soon sorry sort sorted sorts sought soul souls sound sounds soup source space spaces
span spank spare spas speak speaks spec specs speech speed speeds spell spend spent sphere
spice spider spies spin spine spirit split spoke spoken sport sports spot spots spouse spray
spread spring squad square stable stack staff stage stages stake stamp stamps stand stands star
stars start starts stat state stated states static stats status stay stayed stays steady steal
steam steel stem step steps stereo stick sticks sticky still stock stocks stolen stones stood
stop stops store stored stores storm story strain strand strap stream street stress strict
strike string stroke struck stuck stud studio study stuff stupid style styles stylus submit
subtle such sudden suffer sugar suit suite suited suites suits summit sunny sunset super superb
supply sure surely surf surge surrey survey swap swim swing switch sword symbol sync syntax
system table tables tablet tabs tackle tagged tags tail take taken takes taking tale talent
tales talk talked talks tall tank tanks tape tapes tariff task tasks taste tattoo taught taxes
taxi teach team teams tear tears tech techno teeth tells temp tenant tend tender tennis tent
term terms test tested tests text texts than thank thanks that thee theft their them theme
themes then theory there these thesis theta they thick thin thing things think thinks third
thirty this those thou though thread threat three throat throw thrown throws thru thumb thumbs
thus ticket tied tier ties tiger tigers tight tile tiles till timber time timely timer times
timing tiny tips tire tired tires tissue titans title titled titles today toilet token told
toll tomato tone toner tones tongue tons took tool tools tooth topic topics tops total totals
touch tough tour tours toward tower towers town towns toxic toys trace track tracks tract trade
trader trades trail trails train trains trance trans trap trash trauma travel tray treat treaty
tree trees trek trend trends trial trials tribal tribe tribes trick tricks tried tries trim
trio trip triple trips trivia troops trout truck trucks true truly trunk trust trusts trying
tube tubes tumor tune tuner tunes tuning tunnel turn turned turns turtle twelve twenty twice
twin twins twist type types typing ugly ultra unable uncle under undo unique unit united units
unity unless unlike unlock until unto unwrap update upload upon upper upset urge urgent usage
used useful user users uses using usual vacuum valid valley value valued values valve valves
varied varies vary vast vault vector velvet vendor venue venues verbal verify verse versus
vertex very vessel vice video videos view viewed viewer views viii vinyl violin viral virgin
virtue virus vision visit visits vista visual vital vocal vocals voice voices void volt volume
vote voted voters votes voting wage wages wagon wait waiver walk walked walks wallet walnut
want wanted wants warm warned wars washer waste watch water wave waves ways weak wealth wear
webcam weed week weekly weight weird well went were whale what whats wheat wheel wheels when
where which while whilst whole whom whose wicked wide widely wider width wife wiki wild willow
wind window winds wing wings winner wins winter wire wired wires wiring wisdom wish wishes
witch with within wives wizard woman women wooden wool word words work worked worker works
world worlds worm worn worry worse worst worth worthy would wound wrap wrist write writer
writes wrong wrote yacht yard yards yarn yeah year yearly years yeast yellow yield yields yoga
your yours youth zero zinc zone zones zoning zoom
`;

export const WEAVE_WORDS: readonly string[] = LIST.split(/\s+/).filter(Boolean);
