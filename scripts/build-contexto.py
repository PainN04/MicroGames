# Gera os dados do Contexto (lib/data/contexto.bin + contexto.json) a partir dos vetores de palavras do spaCy.
# Roda uma vez, fora do app (o servidor só lê os arquivos prontos):
#   python3 -m venv venv && ./venv/bin/pip install spacy numpy pt_core_news_lg-3.8.0-py3-none-any.whl
#   (o .whl vem de github.com/explosion/spacy-models/releases; a lista de frequência de
#    github.com/hermitdave/FrequencyWords, content/2018/pt_br/pt_br_50k.txt)
#   ./venv/bin/python scripts/build-contexto.py pt_br_50k.txt
# Vocabulário: as 25 mil palavras mais comuns (legendas de filmes) que têm vetor, juntadas pelo lema
# (CACHORROS, cachorra → cachorro). Cada palavra vira 300 números de -127 a 127 (vetor normalizado).
import sys, re, json, unicodedata
import numpy as np, spacy

FREQ = sys.argv[1]
SECRETS = """casa carro cachorro gato praia escola dinheiro amor café futebol chuva médico computador livro mesa cadeira janela porta
árvore flor sol lua estrela mar rio montanha floresta cidade rua ponte trem avião barco navio bicicleta ônibus hospital igreja mercado
restaurante cozinha banheiro quarto sala jardim fazenda vaca cavalo porco galinha pássaro peixe tubarão baleia leão tigre elefante macaco
cobra aranha formiga abelha borboleta pão queijo leite ovo arroz feijão carne frango bolo chocolate sorvete pizza fruta banana maçã laranja
uva morango tomate batata cenoura cebola alho sal açúcar água vinho cerveja suco chá garrafa copo prato faca garfo colher panela fogão
geladeira televisão rádio telefone celular relógio óculos chapéu sapato camisa calça vestido roupa bolsa mochila chave cama travesseiro
espelho lâmpada vela fogo gelo neve vento nuvem tempestade raio trovão terremoto vulcão ilha deserto caverna lago cachoeira oceano planeta
universo foguete astronauta robô máquina motor bateria papel caneta lápis caderno quadro professor aluno enfermeira policial bombeiro
soldado rei rainha príncipe princesa castelo dragão fantasma bruxa vampiro monstro herói vilão pirata tesouro mapa viagem férias festa
aniversário presente música guitarra piano violão cantor filme cinema teatro palhaço circo jogo bola time campeão medalha corrida natação
academia esporte saúde doença remédio vacina dente olho boca nariz orelha cabelo mão pé coração cérebro sangue osso pele família mãe pai
irmão filho avó bebê amigo namorada casamento trabalho escritório empresa chefe reunião salário banco cartão moeda loja shopping fila
trânsito estrada gasolina polícia prisão juiz advogado crime ladrão guerra paz bandeira país governo presidente eleição voto lei
universidade prova nota biblioteca história ciência matemática química física arte pintura desenho foto câmera jornal notícia internet
senha email teclado tela vídeo sonho medo alegria tristeza raiva saudade beijo abraço sorriso lágrima segredo mentira verdade tempo hora
dia noite manhã tarde semana mês ano inverno verão primavera outono natal páscoa carnaval""".split()
SECRETS = list(dict.fromkeys(SECRETS))

nlp = spacy.load('pt_core_news_lg')
from spacy.lang.pt.stop_words import STOP_WORDS
WORD = re.compile(r'[a-záàâãéêíóôõúüç]{3,}')
strip = lambda s: ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

words = []
for line in open(FREQ, encoding='utf8'):
    w = line.split()[0]
    if WORD.fullmatch(w) and nlp.vocab.has_vector(w): words.append(w)
words = words[:25000]

vocab, idx, surf = [], {}, {}
def add(w):
    if w not in idx: idx[w] = len(vocab); vocab.append(w)
    return idx[w]
for s in SECRETS: add(s)  # as respostas sempre existem do jeito que são
for doc in nlp.pipe(words, batch_size=2000):
    t = doc[0]; w = t.text
    if t.pos_ not in ('NOUN', 'VERB', 'ADJ', 'ADV') or (t.pos_ == 'ADV' and w in STOP_WORDS): continue
    lemma = t.lemma_.lower()
    # particípio usado como substantivo (vestido, pedido) fica como palavra própria
    if t.pos_ == 'VERB' and re.search(r'(ad|id)[oa]s?$', w): lemma = w
    if not WORD.fullmatch(lemma) or not nlp.vocab.has_vector(lemma): lemma = w
    key = strip(lemma)
    i = surf.get(key)  # cafe / café: fica a forma mais comum (a que aparece primeiro)
    if i is None: i = add(lemma); surf[key] = i
    surf.setdefault(strip(w), i)
for s in SECRETS: surf[strip(s)] = idx[s]

M = np.array([nlp.vocab.get_vector(w) for w in vocab], dtype=np.float32)
M /= np.linalg.norm(M, axis=1, keepdims=True)
Q = np.clip(np.round(M * 127 / np.abs(M).max(axis=1, keepdims=True)), -127, 127).astype(np.int8)
Q.tofile('lib/data/contexto.bin')
# só as formas que não são a própria palavra do vocabulário (o resto o servidor deduz)
extra = {k: i for k, i in surf.items() if strip(vocab[i]) != k}
json.dump({'dims': 300, 'vocab': vocab, 'forms': extra, 'secrets': SECRETS}, open('lib/data/contexto.json', 'w', encoding='utf8'), ensure_ascii=False, separators=(',', ':'))
print('vocabulário', len(vocab), 'formas extras', len(extra), 'respostas', len(SECRETS))
