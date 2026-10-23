// Gera os dados do Bandeira (lib/data/bandeiras.json). Roda uma vez, fora do app.
//   node scripts/build-diarios.js <pasta>
// <pasta> com:
//   world-countries/countries.json  (npm world-countries, licença ODbL: nomes em português, capital, coordenadas)
//   flag-icons/4x3/*.svg            (npm flag-icons, MIT: as bandeiras)
const fs = require('node:fs');
const path = require('node:path');
const dir = process.argv[2];
const out = f => path.join(__dirname, '..', 'lib', 'data', f);

/* ---------- Bandeira: os 193 países da ONU ---------- */
const CONT = { Africa: 'África', Asia: 'Ásia', Europe: 'Europa', Oceania: 'Oceania' };
const SUB = { 'South America': 'América do Sul', 'North America': 'América do Norte', 'Central America': 'América Central', Caribbean: 'Caribe' };
// a tradução do world-countries é de Portugal: nomes e capitais como se fala no Brasil (e outros nomes que valem como palpite)
const NOME = { 'Arménia': 'Armênia', 'Azerbeijão': 'Azerbaijão', Botswana: 'Botsuana', 'Chéquia': 'Tchéquia', Djibouti: 'Djibuti', 'Estónia': 'Estônia',
  'Irão': 'Irã', 'Quénia': 'Quênia', 'Letónia': 'Letônia', 'Mónaco': 'Mônaco', 'Madagáscar': 'Madagascar', 'Macedónia do Norte': 'Macedônia do Norte',
  Myanmar: 'Mianmar', Malawi: 'Malaui', Holanda: 'Países Baixos', 'Perú': 'Peru', 'Polónia': 'Polônia', 'Roménia': 'Romênia', 'Eslovénia': 'Eslovênia',
  'Suazilândia': 'Essuatíni', Seicheles: 'Seychelles', 'Tajiquistão': 'Tadjiquistão', 'São Vincente e Granadinas': 'São Vicente e Granadinas',
  Vietname: 'Vietnã', 'Iémen': 'Iêmen', Zimbabwe: 'Zimbábue', 'Cidade do Vaticano': 'Vaticano', 'Trinidade e Tobago': 'Trinidad e Tobago' };
const ALIAS = { 'Estados Unidos': ['EUA', 'Estados Unidos da América'], 'Reino Unido': ['Inglaterra', 'Grã-Bretanha'], 'Países Baixos': ['Holanda'],
  'Tchéquia': ['República Tcheca', 'Chéquia'], 'Essuatíni': ['Suazilândia'], 'Mianmar': ['Birmânia', 'Myanmar'], 'Coreia do Sul': ['Coreia'],
  'Timor-Leste': ['Timor'], 'Vaticano': ['Cidade do Vaticano'], 'República Democrática do Congo': ['RD Congo', 'Congo-Kinshasa'], 'Congo': ['Congo-Brazzaville'],
  'Macedônia do Norte': ['Macedônia'], 'Bósnia e Herzegovina': ['Bósnia'], 'Emirados Árabes Unidos': ['Emirados'] };
const CAPITAL = { Kabul: 'Cabul', Yerevan: 'Erevan', Vienna: 'Viena', Brussels: 'Bruxelas', Ouagadougou: 'Uagadugu', Dhaka: 'Daca', Thimphu: 'Timbu',
  Bern: 'Berna', Beijing: 'Pequim', 'Yaoundé': 'Iaundê', 'San José': 'São José', Nicosia: 'Nicósia', Prague: 'Praga', Berlin: 'Berlim', Djibouti: 'Djibuti',
  Copenhagen: 'Copenhague', Algiers: 'Argel', 'Addis Ababa': 'Adis Abeba', Helsinki: 'Helsinque', London: 'Londres', Accra: 'Acra', Conakry: 'Conacri',
  Athens: 'Atenas', 'Guatemala City': 'Cidade da Guatemala', 'Port-au-Prince': 'Porto Príncipe', Budapest: 'Budapeste', Jakarta: 'Jacarta',
  'New Delhi': 'Nova Délhi', Tehran: 'Teerã', Baghdad: 'Bagdá', Reykjavik: 'Reykjavík', Jerusalem: 'Jerusalém', Rome: 'Roma', Amman: 'Amã', Tokyo: 'Tóquio',
  Bishkek: 'Bisqueque', 'South Tarawa': 'Taraua do Sul', Seoul: 'Seul', 'Kuwait City': 'Cidade do Kuwait', Beirut: 'Beirute', Tripoli: 'Trípoli',
  Luxembourg: 'Luxemburgo', Monaco: 'Mônaco', 'Chișinău': 'Chisinau', 'Mexico City': 'Cidade do México', Skopje: 'Escópia', Valletta: 'Valeta',
  Warsaw: 'Varsóvia', Lisbon: 'Lisboa', 'Asunción': 'Assunção', Bucharest: 'Bucareste', Moscow: 'Moscou', Riyadh: 'Riad', Khartoum: 'Cartum',
  Singapore: 'Singapura', 'City of San Marino': 'San Marino', Mogadishu: 'Mogadíscio', Belgrade: 'Belgrado', Ljubljana: 'Liubliana', Stockholm: 'Estocolmo',
  Victoria: 'Vitória', Damascus: 'Damasco', "N'Djamena": 'Jamena', Bangkok: 'Bangcoc', Dushanbe: 'Duchambe', Ashgabat: 'Asgabate', Dili: 'Díli',
  'Port of Spain': 'Porto de Espanha', Tunis: 'Túnis', Ankara: 'Ancara', Kyiv: 'Kiev', Montevideo: 'Montevidéu', 'Washington D.C.': 'Washington',
  'Vatican City': 'Vaticano', Hanoi: 'Hanói', "Sana'a": 'Sanaa', Pretoria: 'Pretória', 'Panama City': 'Cidade do Panamá', Kathmandu: 'Katmandu',
  Muscat: 'Mascate', Amsterdam: 'Amsterdã', 'Santo Domingo': 'São Domingos', 'St. George\'s': "Saint George's", Lobamba: 'Mbabane' };
const countries = JSON.parse(fs.readFileSync(path.join(dir, 'world-countries/countries.json'), 'utf8')).filter(c => c.unMember);
const flags = countries.map(c => {
  // sem comentário, título nem o id "flag-icons-br": o desenho não pode entregar o país
  const svg = fs.readFileSync(path.join(dir, 'flag-icons/4x3', c.cca2.toLowerCase() + '.svg'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, '').replace(/<title>[\s\S]*?<\/title>/g, '').replace(/<metadata>[\s\S]*?<\/metadata>/g, '')
    .replace(/ id="flag-icons-[a-z]+"/g, '').replace(/\s*\n\s*/g, ' ').trim();
  // ids internos ("br-a") começam com a sigla do país: viram f0, f1...
  const ids = [...new Set([...svg.matchAll(/ id="([^"]+)"/g)].map(m => m[1]))];
  let clean = svg;
  ids.forEach((id, k) => { clean = clean.split(`"${id}"`).join(`"f${k}"`).split(`#${id})`).join(`#f${k})`).split(`#${id}"`).join(`#f${k}"`); });
  const nome = NOME[c.translations.por.common] || c.translations.por.common, capital = (c.capital || [])[0] || '';
  return {
    nome, alias: ALIAS[nome] || [], capital: CAPITAL[capital] || capital, lat: c.latlng[0], lng: c.latlng[1],
    continente: c.region === 'Americas' ? SUB[c.subregion] || 'América' : CONT[c.region], area: c.area, svg: clean,
  };
});
fs.writeFileSync(out('bandeiras.json'), JSON.stringify(flags));
console.log('bandeiras', flags.length);

// As palavras do Soletra saem de scripts/build-soletra.py (com plural e conjugação).
