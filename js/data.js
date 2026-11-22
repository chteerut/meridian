/* Curated destinations. Photos, descriptions and sight details are loaded live
   from Wikipedia / Wikimedia Commons. "budget" is a rough guide only. */
const c = (id, name, country, lat, lng, region, best, budget, line, sights, wiki) =>
  ({ id, name, country, lat, lng, region, best, budget, line, sights, wiki: wiki || name, kind: 'city' });

window.CITIES = [
  // Asia
  c('bangkok', 'Bangkok', 'Thailand', 13.7563, 100.5018, 'Asia', 'Nov to Feb', '$', 'Golden temples, river boats and street food until late.', ['Grand Palace', 'Wat Arun', 'Wat Pho', 'Chatuchak Weekend Market']),
  c('chiang-mai', 'Chiang Mai', 'Thailand', 18.7883, 98.9853, 'Asia', 'Nov to Feb', '$', 'Old city walls, mountain temples and slow mornings.', ['Wat Phra That Doi Suthep', 'Wat Chedi Luang', 'Wat Phra Singh', 'Doi Inthanon']),
  c('tokyo', 'Tokyo', 'Japan', 35.6762, 139.6503, 'Asia', 'Mar to May, Oct to Nov', '$$$', 'Neon crossings next to quiet shrines.', ['Sensō-ji', 'Shibuya Crossing', 'Meiji Shrine', 'Tokyo Skytree']),
  c('kyoto', 'Kyoto', 'Japan', 35.0116, 135.7681, 'Asia', 'Mar to May, Oct to Nov', '$$$', 'Thousands of torii gates, tea houses and gardens.', ['Fushimi Inari-taisha', 'Kinkaku-ji', 'Kiyomizu-dera', 'Arashiyama']),
  c('seoul', 'Seoul', 'South Korea', 37.5665, 126.978, 'Asia', 'Apr to Jun, Sep to Nov', '$$', 'Palaces, night markets and mountain views.', ['Gyeongbokgung', 'Bukchon Hanok Village', 'N Seoul Tower', 'Myeong-dong']),
  c('singapore', 'Singapore', 'Singapore', 1.3521, 103.8198, 'Asia', 'Feb to Apr', '$$$', 'A garden city with hawker food on every corner.', ['Gardens by the Bay', 'Marina Bay Sands', 'Sentosa', 'Singapore Botanic Gardens']),
  c('bali', 'Bali', 'Indonesia', -8.5069, 115.2625, 'Asia', 'May to Sep', '$', 'Rice terraces, sea temples and surf.', ['Tanah Lot', 'Uluwatu Temple', 'Mount Batur', 'Ubud']),
  c('hanoi', 'Hanoi', 'Vietnam', 21.0278, 105.8342, 'Asia', 'Oct to Apr', '$', 'Lakeside mornings and the best noodle soup around.', ['Hoàn Kiếm Lake', 'Temple of Literature, Hanoi', 'Ho Chi Minh Mausoleum', 'Hạ Long Bay']),
  c('hong-kong', 'Hong Kong', 'China', 22.3193, 114.1694, 'Asia', 'Oct to Dec', '$$$', 'A harbour skyline wrapped in green peaks.', ['Victoria Peak', 'Victoria Harbour', 'Tian Tan Buddha', 'Star Ferry']),
  c('jaipur', 'Jaipur', 'India', 26.9124, 75.7873, 'Asia', 'Oct to Mar', '$', 'The pink city of forts and palaces.', ['Hawa Mahal', 'Amber Fort', 'City Palace, Jaipur', 'Jantar Mantar, Jaipur']),
  c('kathmandu', 'Kathmandu', 'Nepal', 27.7172, 85.324, 'Asia', 'Oct to Dec, Mar to Apr', '$', 'Stupas, squares and the gateway to the Himalayas.', ['Swayambhunath', 'Boudhanath', 'Kathmandu Durbar Square', 'Pashupatinath Temple']),
  c('dubai', 'Dubai', 'United Arab Emirates', 25.2048, 55.2708, 'Middle East', 'Nov to Mar', '$$$', 'Desert dunes and the tallest tower on Earth.', ['Burj Khalifa', 'Dubai Mall', 'Palm Jumeirah', 'Dubai Creek']),
  c('petra', 'Petra', 'Jordan', 30.3285, 35.4444, 'Middle East', 'Mar to May, Sep to Nov', '$$', 'A city carved into rose-red rock.', ['Al-Khazneh', 'Ad Deir', 'Siq', 'Wadi Rum']),

  // Europe
  c('paris', 'Paris', 'France', 48.8566, 2.3522, 'Europe', 'Apr to Jun, Sep to Oct', '$$$', 'Cafe terraces, museums and river walks.', ['Eiffel Tower', 'Louvre', 'Notre-Dame de Paris', 'Montmartre']),
  c('london', 'London', 'United Kingdom', 51.5074, -0.1278, 'Europe', 'May to Sep', '$$$', 'Royal parks, free museums and old pubs.', ['Tower of London', 'British Museum', 'Westminster Abbey', 'Tower Bridge']),
  c('rome', 'Rome', 'Italy', 41.9028, 12.4964, 'Europe', 'Apr to Jun, Sep to Oct', '$$', 'Two thousand years of history on one walk.', ['Colosseum', 'Trevi Fountain', 'Pantheon, Rome', 'Roman Forum']),
  c('barcelona', 'Barcelona', 'Spain', 41.3851, 2.1734, 'Europe', 'May to Jun, Sep to Oct', '$$', 'Gaudi curves, beaches and late dinners.', ['Sagrada Família', 'Park Güell', 'Casa Batlló', 'La Rambla, Barcelona']),
  c('lisbon', 'Lisbon', 'Portugal', 38.7223, -9.1393, 'Europe', 'Mar to May, Sep to Oct', '$$', 'Tiled hills, yellow trams and Atlantic light.', ['Belém Tower', 'Jerónimos Monastery', 'Alfama', 'Praça do Comércio']),
  c('amsterdam', 'Amsterdam', 'Netherlands', 52.3676, 4.9041, 'Europe', 'Apr to May, Sep', '$$$', 'Canals, bikes and world-class art.', ['Rijksmuseum', 'Anne Frank House', 'Van Gogh Museum', 'Vondelpark']),
  c('prague', 'Prague', 'Czech Republic', 50.0755, 14.4378, 'Europe', 'May to Sep', '$$', 'Gothic spires above a storybook old town.', ['Charles Bridge', 'Prague Castle', 'Old Town Square', 'Prague astronomical clock']),
  c('vienna', 'Vienna', 'Austria', 48.2082, 16.3738, 'Europe', 'Apr to May, Sep to Oct', '$$', 'Palaces, coffee houses and concert halls.', ['Schönbrunn Palace', "St. Stephen's Cathedral, Vienna", 'Hofburg', 'Belvedere, Vienna']),
  c('santorini', 'Santorini', 'Greece', 36.3932, 25.4615, 'Europe', 'May to Jun, Sep to Oct', '$$$', 'White villages on the rim of a volcano.', ['Oia, Greece', 'Fira', 'Akrotiri (prehistoric city)', 'Pyrgos Kallistis']),
  c('istanbul', 'Istanbul', 'Turkey', 41.0082, 28.9784, 'Europe', 'Apr to May, Sep to Nov', '$$', 'One city across two continents.', ['Hagia Sophia', 'Blue Mosque, Istanbul', 'Topkapı Palace', 'Grand Bazaar, Istanbul']),
  c('reykjavik', 'Reykjavik', 'Iceland', 64.1466, -21.9426, 'Europe', 'Jun to Aug, Feb to Mar for aurora', '$$$', 'Hot springs, lava fields and northern lights.', ['Hallgrímskirkja', 'Blue Lagoon (geothermal spa)', 'Harpa (concert hall)', 'Þingvellir'], 'Reykjavík'),

  // Africa
  c('marrakech', 'Marrakech', 'Morocco', 31.6295, -7.9811, 'Africa', 'Mar to May, Sep to Nov', '$', 'Souks, riads and a square that never sleeps.', ['Jemaa el-Fnaa', 'Majorelle Garden', 'Bahia Palace', 'Kutubiyya Mosque']),
  c('cairo', 'Cairo', 'Egypt', 30.0444, 31.2357, 'Africa', 'Oct to Apr', '$', 'The pyramids at the edge of a huge city.', ['Giza pyramid complex', 'Great Sphinx of Giza', 'Egyptian Museum', 'Cairo Citadel']),
  c('cape-town', 'Cape Town', 'South Africa', -33.9249, 18.4241, 'Africa', 'Nov to Mar', '$$', 'A flat-topped mountain between two oceans.', ['Table Mountain', 'Cape of Good Hope', 'Robben Island', 'Kirstenbosch National Botanical Garden']),
  c('zanzibar', 'Zanzibar', 'Tanzania', -6.1659, 39.2026, 'Africa', 'Jun to Oct', '$$', 'Spice markets and turquoise shallows.', ['Stone Town', 'Jozani Chwaka Bay National Park', 'Nungwi', 'Changuu']),

  // Americas
  c('new-york', 'New York', 'United States', 40.7128, -74.006, 'Americas', 'Apr to Jun, Sep to Nov', '$$$', 'Five boroughs of skyline, parks and pizza.', ['Statue of Liberty', 'Central Park', 'Brooklyn Bridge', 'Times Square'], 'New York City'),
  c('san-francisco', 'San Francisco', 'United States', 37.7749, -122.4194, 'Americas', 'Sep to Nov', '$$$', 'Fog, hills and a famous red bridge.', ['Golden Gate Bridge', 'Alcatraz Island', "Fisherman's Wharf, San Francisco", 'Lombard Street (San Francisco)']),
  c('vancouver', 'Vancouver', 'Canada', 49.2827, -123.1207, 'Americas', 'Jun to Sep', '$$', 'A glass city between forest and sea.', ['Stanley Park', 'Granville Island', 'Capilano Suspension Bridge', 'Gastown']),
  c('mexico-city', 'Mexico City', 'Mexico', 19.4326, -99.1332, 'Americas', 'Mar to May', '$', 'Murals, markets and ancient pyramids nearby.', ['Zócalo', 'Chapultepec', 'Teotihuacan', 'Frida Kahlo Museum']),
  c('havana', 'Havana', 'Cuba', 23.1136, -82.3666, 'Americas', 'Nov to Apr', '$', 'Pastel streets, classic cars and live music.', ['Old Havana', 'Malecón, Havana', 'El Capitolio', 'Morro Castle (Havana)']),
  c('rio', 'Rio de Janeiro', 'Brazil', -22.9068, -43.1729, 'Americas', 'May to Oct', '$$', 'Beaches below granite peaks.', ['Christ the Redeemer (statue)', 'Sugarloaf Mountain', 'Copacabana, Rio de Janeiro', 'Ipanema']),
  c('cusco', 'Cusco', 'Peru', -13.5319, -71.9675, 'Americas', 'May to Sep', '$', 'The Inca capital and the road to Machu Picchu.', ['Machu Picchu', 'Sacsayhuamán', 'Sacred Valley', 'Vinicunca']),
  c('buenos-aires', 'Buenos Aires', 'Argentina', -34.6037, -58.3816, 'Americas', 'Mar to May, Sep to Nov', '$', 'Tango halls, grills and grand avenues.', ['La Boca', 'La Recoleta Cemetery', 'Plaza de Mayo', 'Teatro Colón']),

  // Oceania
  c('sydney', 'Sydney', 'Australia', -33.8688, 151.2093, 'Oceania', 'Sep to Nov, Mar to May', '$$$', 'Harbour ferries and surf beaches.', ['Sydney Opera House', 'Sydney Harbour Bridge', 'Bondi Beach', 'Royal Botanic Garden, Sydney']),
  c('queenstown', 'Queenstown', 'New Zealand', -45.0312, 168.6626, 'Oceania', 'Dec to Feb, Jun to Aug for snow', '$$', 'Lakes, peaks and every outdoor thrill.', ['Milford Sound', 'Lake Wakatipu', 'The Remarkables', 'Arrowtown'], 'Queenstown, New Zealand'),
];

// Cities whose Wikipedia lead image is a flag or map get a better cover photo source.
const covers = { singapore: 'Marina Bay Sands', bali: 'Tanah Lot', 'hong-kong': 'Victoria Harbour', zanzibar: 'Stone Town' };
window.CITIES.forEach(city => { if (covers[city.id]) city.img = covers[city.id]; });
