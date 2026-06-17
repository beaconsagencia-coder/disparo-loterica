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
];
