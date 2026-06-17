// Catálogo dos principais bairros das principais cidades do Brasil.
// Não é exaustivo (não cobre 100% dos bairros), mas cobre as regiões mais
// densas das capitais e grandes cidades — suficiente para varrer com boa
// cobertura. Bairros extras podem ser adicionados na aba (colando uma lista).

export interface CidadeCatalogo {
  cidade: string;
  estado: string; // UF
  bairros: string[];
}

export const CATALOGO_BRASIL: CidadeCatalogo[] = [
  // --- Maranhão (mercado principal) ---
  {
    cidade: "São Luís", estado: "MA",
    bairros: ["Centro", "Renascença", "Cohama", "Turu", "Calhau", "Ponta d'Areia", "São Francisco",
      "Cohatrac", "Cidade Operária", "Anil", "Vinhais", "Olho d'Água", "Cohab", "Bequimão",
      "Monte Castelo", "João Paulo", "Angelim", "Maiobão", "Tirirical", "Jardim São Cristóvão"],
  },
  {
    cidade: "Imperatriz", estado: "MA",
    bairros: ["Centro", "Nova Imperatriz", "Bacuri", "Maranhão Novo", "Vila Nova", "Parque do Buriti",
      "Três Poderes", "Mercadinho", "Entroncamento", "Vila Lobão"],
  },
  // --- Sudeste ---
  {
    cidade: "São Paulo", estado: "SP",
    bairros: ["Centro", "Sé", "Pinheiros", "Vila Mariana", "Moema", "Tatuapé", "Santana", "Pirituba",
      "Itaquera", "Mooca", "Lapa", "Santo Amaro", "Ipiranga", "Penha", "Butantã", "Vila Prudente",
      "Campo Limpo", "Freguesia do Ó", "Jabaquara", "Cidade Tiradentes", "Capão Redondo", "Sapopemba",
      "Brás", "Liberdade", "Vila Formosa"],
  },
  {
    cidade: "Guarulhos", estado: "SP",
    bairros: ["Centro", "Vila Galvão", "Pimentas", "Bonsucesso", "Taboão", "Cumbica", "Macedo",
      "Picanço", "Jardim Maia", "São João"],
  },
  {
    cidade: "Campinas", estado: "SP",
    bairros: ["Centro", "Cambuí", "Barão Geraldo", "Taquaral", "Jardim Proença", "Nova Campinas",
      "Sousas", "Botafogo", "Vila Industrial", "Campo Grande"],
  },
  {
    cidade: "Rio de Janeiro", estado: "RJ",
    bairros: ["Centro", "Copacabana", "Tijuca", "Madureira", "Campo Grande", "Bangu", "Botafogo",
      "Méier", "Barra da Tijuca", "Ipanema", "Jacarepaguá", "Realengo", "Santa Cruz", "Penha",
      "Ilha do Governador", "Flamengo", "Vila Isabel", "Irajá", "Taquara", "Recreio dos Bandeirantes"],
  },
  {
    cidade: "Belo Horizonte", estado: "MG",
    bairros: ["Centro", "Savassi", "Pampulha", "Barreiro", "Venda Nova", "Cidade Nova", "Funcionários",
      "Santa Efigênia", "Floresta", "Prado", "Santa Tereza", "Gutierrez", "Buritis", "Castelo"],
  },
  {
    cidade: "Vitória", estado: "ES",
    bairros: ["Centro", "Praia do Canto", "Jardim da Penha", "Jardim Camburi", "Maruípe", "Goiabeiras",
      "Bento Ferreira", "Jucutuquara", "Praia do Suá", "Mata da Praia"],
  },
  // --- Sul ---
  {
    cidade: "Curitiba", estado: "PR",
    bairros: ["Centro", "Batel", "Boa Vista", "Cabral", "Portão", "Santa Felicidade", "CIC",
      "Boqueirão", "Sítio Cercado", "Cajuru", "Água Verde", "Bacacheri", "Pinheirinho", "Xaxim", "Tatuquara"],
  },
  {
    cidade: "Porto Alegre", estado: "RS",
    bairros: ["Centro Histórico", "Moinhos de Vento", "Cidade Baixa", "Menino Deus", "Petrópolis",
      "Partenon", "Restinga", "Sarandi", "Cavalhada", "Bom Fim", "Tristeza", "Cristal", "Rubem Berta"],
  },
  {
    cidade: "Florianópolis", estado: "SC",
    bairros: ["Centro", "Trindade", "Lagoa da Conceição", "Canasvieiras", "Ingleses", "Campeche",
      "Estreito", "Coqueiros", "Capoeiras", "Santo Antônio de Lisboa", "Itacorubi", "Saco dos Limões"],
  },
  // --- Nordeste ---
  {
    cidade: "Salvador", estado: "BA",
    bairros: ["Centro", "Barra", "Pituba", "Itapuã", "Brotas", "Liberdade", "Cajazeiras", "Pernambués",
      "Federação", "Ondina", "Cabula", "São Caetano", "Periperi", "Itapagipe", "Stella Maris", "Paripe"],
  },
  {
    cidade: "Fortaleza", estado: "CE",
    bairros: ["Centro", "Aldeota", "Meireles", "Messejana", "Parangaba", "Mondubim", "Barra do Ceará",
      "Antônio Bezerra", "Montese", "Benfica", "Cocó", "Edson Queiroz", "Conjunto Ceará", "Bom Jardim", "Papicu"],
  },
  {
    cidade: "Recife", estado: "PE",
    bairros: ["Boa Viagem", "Santo Antônio", "Boa Vista", "Casa Amarela", "Afogados", "Madalena",
      "Pina", "Espinheiro", "Várzea", "Imbiribeira", "Caxangá", "Torre", "Casa Forte", "Ibura"],
  },
  {
    cidade: "Teresina", estado: "PI",
    bairros: ["Centro", "Jóquei", "Fátima", "Dirceu", "Itararé", "Saci", "Pirajá", "São Cristóvão",
      "Horto", "Mocambinho", "Ininga", "Satélite"],
  },
  {
    cidade: "Natal", estado: "RN",
    bairros: ["Cidade Alta", "Petrópolis", "Tirol", "Ponta Negra", "Capim Macio", "Alecrim",
      "Lagoa Nova", "Candelária", "Neópolis", "Pitimbu", "Cidade da Esperança", "Igapó"],
  },
  {
    cidade: "João Pessoa", estado: "PB",
    bairros: ["Centro", "Manaíra", "Tambaú", "Bessa", "Bancários", "Mangabeira", "Cristo Redentor",
      "Cabo Branco", "Valentina", "Jaguaribe", "Torre", "Cruz das Armas"],
  },
  {
    cidade: "Maceió", estado: "AL",
    bairros: ["Centro", "Pajuçara", "Ponta Verde", "Jatiúca", "Benedito Bentes", "Farol", "Jacintinho",
      "Cruz das Almas", "Tabuleiro do Martins", "Serraria", "Antares"],
  },
  {
    cidade: "Aracaju", estado: "SE",
    bairros: ["Centro", "Atalaia", "Farolândia", "Jardins", "Grageru", "Coroa do Meio", "Siqueira Campos",
      "Luzia", "Inácio Barbosa", "Santos Dumont"],
  },
  // --- Norte ---
  {
    cidade: "Belém", estado: "PA",
    bairros: ["Campina", "Nazaré", "Batista Campos", "Marco", "Pedreira", "Guamá", "Sacramenta",
      "Umarizal", "Cremação", "Telégrafo", "Icoaraci", "Marambaia", "Cidade Velha"],
  },
  {
    cidade: "Manaus", estado: "AM",
    bairros: ["Centro", "Adrianópolis", "Cidade Nova", "Compensa", "Aparecida", "Educandos", "Flores",
      "Petrópolis", "São José Operário", "Japiim", "Alvorada", "Cidade de Deus", "Tarumã"],
  },
  {
    cidade: "Porto Velho", estado: "RO",
    bairros: ["Centro", "Nova Porto Velho", "São Cristóvão", "Areal", "Embratel", "Industrial",
      "Flodoaldo Pontes Pinto", "Tucumanzal", "Agenor de Carvalho"],
  },
  // --- Centro-Oeste ---
  {
    cidade: "Brasília", estado: "DF",
    bairros: ["Asa Sul", "Asa Norte", "Taguatinga", "Ceilândia", "Samambaia", "Gama", "Sobradinho",
      "Planaltina", "Águas Claras", "Guará", "Núcleo Bandeirante", "Recanto das Emas", "Santa Maria",
      "São Sebastião", "Riacho Fundo", "Lago Sul"],
  },
  {
    cidade: "Goiânia", estado: "GO",
    bairros: ["Setor Central", "Setor Bueno", "Setor Oeste", "Setor Sul", "Campinas", "Jardim América",
      "Setor Marista", "Vila Nova", "Setor Universitário", "Setor Pedro Ludovico", "Jardim Goiás", "Setor Coimbra"],
  },
  {
    cidade: "Campo Grande", estado: "MS",
    bairros: ["Centro", "Jardim dos Estados", "Tiradentes", "Coophavila", "Aero Rancho", "Amambaí",
      "Universitário", "Tijuca", "Carandá Bosque", "Monte Castelo"],
  },
  {
    cidade: "Cuiabá", estado: "MT",
    bairros: ["Centro", "Coxipó", "Jardim Cuiabá", "Santa Rosa", "CPA", "Morada do Ouro", "Pedra 90",
      "Goiabeiras", "Boa Esperança", "Jardim Aclimação"],
  },

  // =====================================================================
  // INTERIOR DO NORDESTE (exceto Maranhão) — principais cidades não-capital
  // =====================================================================

  // --- Bahia (interior) ---
  {
    cidade: "Feira de Santana", estado: "BA",
    bairros: ["Centro", "Kalilândia", "Cidade Nova", "Tomba", "Brasília", "Capuchinhos",
      "Santo Antônio dos Prazeres", "Caseb", "Queimadinha", "Sobradinho", "Gabriela", "Mangabeira", "Feira VI"],
  },
  {
    cidade: "Vitória da Conquista", estado: "BA",
    bairros: ["Centro", "Recreio", "Candeias", "Brasil", "Boa Vista", "Patagônia", "Ibirapuera",
      "Felícia", "Alto Maron", "Guarani", "Jurema", "Zabelê"],
  },
  {
    cidade: "Itabuna", estado: "BA",
    bairros: ["Centro", "São Caetano", "Jardim Vitória", "Conceição", "Fátima", "Pontalzinho",
      "São Pedro", "Mangabinha", "Califórnia", "Nova Itabuna"],
  },
  {
    cidade: "Juazeiro", estado: "BA",
    bairros: ["Centro", "Santo Antônio", "João Paulo II", "Maringá", "Itaberaba", "Alto da Maravilha", "Piranga"],
  },
  {
    cidade: "Ilhéus", estado: "BA",
    bairros: ["Centro", "Pontal", "Cidade Nova", "Nelson Costa", "São Domingos", "Malhado",
      "Banco da Vitória", "Conquista"],
  },
  {
    cidade: "Jequié", estado: "BA",
    bairros: ["Centro", "Jequiezinho", "Mandacaru", "Joaquim Romão", "Cansanção", "Brasília", "Curral Novo"],
  },
  {
    cidade: "Barreiras", estado: "BA",
    bairros: ["Centro", "Vila Brasil", "Sandra Regina", "Boa Sorte", "Morada Nobre", "Vila Rica", "Renato Gonçalves"],
  },
  {
    cidade: "Alagoinhas", estado: "BA",
    bairros: ["Centro", "Alagoinhas Velha", "Juracy Magalhães", "Santa Terezinha", "Bairro dos Quintas", "Boa Vista"],
  },
  {
    cidade: "Porto Seguro", estado: "BA",
    bairros: ["Centro", "Arraial d'Ajuda", "Baianão", "Cambolo", "Mirante", "Pacata"],
  },
  {
    cidade: "Paulo Afonso", estado: "BA",
    bairros: ["Centro", "Tancredo Neves", "BTN", "General Dutra", "Alto da Bela Vista", "Vila Poty"],
  },

  // --- Pernambuco (interior) ---
  {
    cidade: "Caruaru", estado: "PE",
    bairros: ["Centro", "Maurício de Nassau", "Universitário", "Petrópolis", "São Francisco", "Indianópolis",
      "Salgado", "Boa Vista", "Agamenon Magalhães", "Cidade Alta", "Kennedy", "Rendeiras"],
  },
  {
    cidade: "Petrolina", estado: "PE",
    bairros: ["Centro", "Areia Branca", "Vila Mocó", "Dom Avelar", "Henrique Leite", "José e Maria",
      "Cohab", "Jardim Amazonas", "Maria Auxiliadora", "Gercino Coelho"],
  },
  {
    cidade: "Garanhuns", estado: "PE",
    bairros: ["Heliópolis", "Centro", "Magano", "São José", "Boa Vista", "Severiano Moraes Filho", "Aloísio Pinto"],
  },
  {
    cidade: "Vitória de Santo Antão", estado: "PE",
    bairros: ["Centro", "Cajá", "Livramento", "Matriz", "Redenção", "Bela Vista"],
  },
  {
    cidade: "Serra Talhada", estado: "PE",
    bairros: ["Centro", "Caxixola", "Bom Jesus", "AABB", "Ipsep", "São Cristóvão"],
  },
  {
    cidade: "Arcoverde", estado: "PE",
    bairros: ["Centro", "São Cristóvão", "São Geraldo", "Bela Vista", "Cohab", "Alto do Cruzeiro"],
  },
  {
    cidade: "Santa Cruz do Capibaribe", estado: "PE",
    bairros: ["Centro", "São Cristóvão", "Malaquias Cardoso", "Cohab", "Nossa Senhora das Dores"],
  },

  // --- Ceará (interior) ---
  {
    cidade: "Juazeiro do Norte", estado: "CE",
    bairros: ["Centro", "Triângulo", "São Miguel", "Pirajá", "Lagoa Seca", "João Cabral", "Romeirão",
      "Franciscanos", "Frei Damião", "Limoeiro"],
  },
  {
    cidade: "Sobral", estado: "CE",
    bairros: ["Centro", "Junco", "Dom Expedito", "Coração de Jesus", "Sumaré", "Cohab", "Alto da Brasília",
      "Padre Palhano", "Dom José"],
  },
  {
    cidade: "Crato", estado: "CE",
    bairros: ["Centro", "Seminário", "Pimenta", "Granjeiro", "Muriti", "Belmonte", "Gisélia Pinheiro"],
  },
  {
    cidade: "Caucaia", estado: "CE",
    bairros: ["Centro", "Jurema", "Parque Potira", "Itambé", "Tabapuá", "Metrópole", "Araturi"],
  },
  {
    cidade: "Maracanaú", estado: "CE",
    bairros: ["Centro", "Pajuçara", "Jereissati", "Piratininga", "Timbó", "Mucunã", "Acaracuzinho"],
  },
  {
    cidade: "Iguatu", estado: "CE",
    bairros: ["Centro", "Veneza", "Tabuleiro", "Prado", "Vila Centenário", "Areias"],
  },
  {
    cidade: "Itapipoca", estado: "CE",
    bairros: ["Centro", "Cidade Nova", "Lagoa", "Violete", "Belo Horizonte", "Cruzeiro"],
  },
  {
    cidade: "Quixadá", estado: "CE",
    bairros: ["Centro", "Campo Velho", "Planalto Universitário", "Comban", "Alto São João"],
  },

  // --- Paraíba (interior) ---
  {
    cidade: "Campina Grande", estado: "PB",
    bairros: ["Centro", "Catolé", "Liberdade", "Bodocongó", "José Pinheiro", "Prata", "Mirante",
      "Bela Vista", "Cruzeiro", "Malvinas", "Jeremias", "Santa Rosa", "Itararé", "Alto Branco"],
  },
  {
    cidade: "Patos", estado: "PB",
    bairros: ["Centro", "Belo Horizonte", "Jardim Magnólia", "Jatobá", "Liberdade", "Santa Cecília",
      "Bivar Olinto", "São Sebastião"],
  },
  {
    cidade: "Sousa", estado: "PB",
    bairros: ["Centro", "Jardim Sorrilândia", "Frei Damião", "Gato Preto", "Angelim", "São Vicente"],
  },
  {
    cidade: "Cajazeiras", estado: "PB",
    bairros: ["Centro", "São José", "Cristo Rei", "Vila Tibério", "Padre Constantino", "Remédios"],
  },
  {
    cidade: "Guarabira", estado: "PB",
    bairros: ["Centro", "Nordeste", "Bairro Novo", "Areia Branca", "Mutirão", "Primavera"],
  },

  // --- Rio Grande do Norte (interior) ---
  {
    cidade: "Mossoró", estado: "RN",
    bairros: ["Centro", "Alto de São Manoel", "Abolição", "Nova Betânia", "Santo Antônio", "Bom Jardim",
      "Aeroporto", "Doze Anos", "Boa Vista", "Costa e Silva", "Belo Horizonte", "Santa Delmira"],
  },
  {
    cidade: "Parnamirim", estado: "RN",
    bairros: ["Centro", "Nova Parnamirim", "Emaús", "Cohabinal", "Passagem de Areia", "Rosa dos Ventos", "Cajupiranga"],
  },
  {
    cidade: "Caicó", estado: "RN",
    bairros: ["Centro", "Penedo", "Paraíba", "Walfredo Gurgel", "Maynard", "Recreio", "Barra Nova"],
  },
  {
    cidade: "Currais Novos", estado: "RN",
    bairros: ["Centro", "Bela Vista", "Manoel Salustino", "Vila Nova", "Walfredo Gurgel"],
  },
  {
    cidade: "Açu", estado: "RN",
    bairros: ["Centro", "Bela Vista", "Ilha de Santana", "Nova Açu", "Alto da Conceição"],
  },

  // --- Piauí (interior) ---
  {
    cidade: "Parnaíba", estado: "PI",
    bairros: ["Centro", "Pindorama", "Frei Higino", "Dirceu Arcoverde", "São Vicente de Paula",
      "Nossa Senhora de Fátima", "Piauí", "Rodoviária"],
  },
  {
    cidade: "Picos", estado: "PI",
    bairros: ["Centro", "Junco", "Bomba", "Paroquial", "Canto da Várzea", "Pedrinhas", "Aerolândia", "Ipueiras"],
  },
  {
    cidade: "Floriano", estado: "PI",
    bairros: ["Centro", "Manguinha", "Vermelha", "Tabuleta", "Sambaíba", "Irapuá"],
  },
  {
    cidade: "Piripiri", estado: "PI",
    bairros: ["Centro", "Modelo", "Pelo Sinal", "São Francisco", "Aroeiras"],
  },

  // --- Alagoas (interior) ---
  {
    cidade: "Arapiraca", estado: "AL",
    bairros: ["Centro", "Brasília", "Itapecerica", "Baixão", "Planalto", "Santa Edwiges",
      "Senador Arnon de Mello", "Caititus", "Capiatã", "Primavera"],
  },
  {
    cidade: "Palmeira dos Índios", estado: "AL",
    bairros: ["Centro", "Xucurus", "Boa Vista", "Caetés", "Vila Maria", "São Cristóvão"],
  },
  {
    cidade: "Rio Largo", estado: "AL",
    bairros: ["Centro", "Tabuleiro", "Brasília", "Cana Brava", "Pilar"],
  },
  {
    cidade: "União dos Palmares", estado: "AL",
    bairros: ["Centro", "Floresta", "Bom Jesus", "Zumbi", "Santo Antônio"],
  },
  {
    cidade: "Penedo", estado: "AL",
    bairros: ["Centro", "Santa Luzia", "Barro Vermelho", "Oiteiro", "Dom Constantino"],
  },

  // --- Sergipe (interior) ---
  {
    cidade: "Nossa Senhora do Socorro", estado: "SE",
    bairros: ["Centro", "Conjunto João Alves", "Marcos Freire", "Fernando Collor", "Piabeta", "Albano Franco"],
  },
  {
    cidade: "Lagarto", estado: "SE",
    bairros: ["Centro", "Cidade Nova", "Loiola", "Alto da Boa Vista", "Carro Quebrado", "Novo Horizonte"],
  },
  {
    cidade: "Itabaiana", estado: "SE",
    bairros: ["Centro", "Marizan", "Sítios Novos", "Porto", "Olaria", "Bairro Industrial"],
  },
  {
    cidade: "Estância", estado: "SE",
    bairros: ["Centro", "Cidade Alta", "Bonfim", "Cirurgia", "Cleto Nunes"],
  },
  {
    cidade: "Tobias Barreto", estado: "SE",
    bairros: ["Centro", "Sinhazinha", "Algodões", "Cohab", "Bom Conselho"],
  },
];
