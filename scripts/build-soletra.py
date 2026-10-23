# Gera as palavras do Soletra (lib/data/soletra.json e lib/data/soletra-extra.txt). Roda uma vez, fora do app:
#   pip install spylls
#   python3 scripts/build-soletra.py <pasta>
# <pasta> com:
#   pt_BR.dic + pt_BR.aff  (dicionário do LibreOffice, github.com/LibreOffice/dictionaries, MPL/LGPL)
#   pt_br_full.txt         (frequência de palavras em legendas, github.com/hermitdave/FrequencyWords, CC BY-SA 4.0)
# Vale toda palavra que o corretor do LibreOffice aceita (com plural, feminino e conjugação) e que aparece nas
# legendas. As 25 mil mais usadas são as do dia (contam no "1/17" e aparecem no fim); todas as outras também
# são aceitas, valem pontos como palavra extra, mas não entram na conta. Plural e feminino de uma palavra aceita
# também valem como extra mesmo sem aparecer nas legendas (ágio -> ágios, gaiato -> gaiatas).
import sys, re, json, unicodedata, os
from spylls.hunspell import Dictionary

DIR = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), '..', 'lib', 'data')
COMMON = 25000
key = lambda w: ''.join(c for c in unicodedata.normalize('NFD', w) if unicodedata.category(c) != 'Mn')
# palavrão nunca vale; o resto da lista fica de fora só das palavras do dia (pode ser aceita como extra)
NEVER = re.compile(r'^(caralh|fod[aeiío]|merd|puta|putinh|puto|putaria|boquet|escrot|porra|cacete|bucet|piroc|punhet|xoxot|cuzao|viad|babac|otari)')
SENSIVEL = re.compile(r'^(estupr|prostitu|suicid|assassin|nazis|nazi$|cocain|drogar|vagin|transa[mnrs]|transou|transe|peid|mij|safad|corno|vagabund|imbecil'
                      r'|bastard|sexo|sexual|cag[aoue]|cagao|cullen|curie'
                      r'|iago$|gita$|gaia$|livia$|silvano$|urias$|caracas$)')  # o fim são nomes que existem no dicionário como palavra rara

# palavras certas que o dicionário do LibreOffice não conhece; valem como extra
ACEITA = {'agitos'}

d = Dictionary.from_files(os.path.join(DIR, 'pt_BR'))
rx = re.compile(r'^[a-záàâãéêíóôõúüç]{4,14}$')
common, extra, seen = [], [], set()
for line in open(os.path.join(DIR, 'pt_br_full.txt'), encoding='utf8'):
    w = line.split()[0]
    if not rx.match(w) or key(w) in seen or NEVER.match(key(w)) or not (w in ACEITA or d.lookup(w)):
        continue
    seen.add(key(w))
    (common if len(common) < COMMON and not SENSIVEL.match(key(w)) else extra).append(w)
# plural e feminino: gaiato -> gaiatos, gaiata, gaiatas; casa -> casas
def forms(w):
    if w[-1] in 'aeiouáéêíóôú':
        yield w + 's'
    if w[-1] in 'oa':
        o = 'a' if w[-1] == 'o' else 'o'
        yield w[:-1] + o
        yield w[:-1] + o + 's'
for w in common + extra:
    for f in forms(w):
        if len(f) <= 14 and key(f) not in seen and not NEVER.match(key(f)) and (f in ACEITA or d.lookup(f)):
            seen.add(key(f))
            extra.append(f)
with open(os.path.join(OUT, 'soletra.json'), 'w', encoding='utf8') as f:
    json.dump(common, f, ensure_ascii=False)
with open(os.path.join(OUT, 'soletra-extra.txt'), 'w', encoding='utf8') as f:
    f.write('\n'.join(sorted(extra)) + '\n')
print('soletra', len(common), 'extras', len(extra))
