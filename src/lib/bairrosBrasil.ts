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

  // =====================================================================
  // MARANHÃO (interior) — mercado principal, cobertura ampliada
  // =====================================================================
  { cidade: "Timon", estado: "MA", bairros: ["Centro", "São Benedito", "Parque Piauí", "Formosa", "Cidade Nova", "Parque Alvorada", "São Marcos", "Mutirão"] },
  { cidade: "Caxias", estado: "MA", bairros: ["Centro", "Trezidela", "Volta Redonda", "Campo de Belém", "Morro Alto", "São José", "Ponte"] },
  { cidade: "Codó", estado: "MA", bairros: ["Centro", "São Benedito", "São Sebastião", "Coquinho", "Bequimão", "Vila Cruzeiro"] },
  { cidade: "Bacabal", estado: "MA", bairros: ["Centro", "Universitário", "Maria Nazaré", "Vila Nova", "Aurora", "São Francisco"] },
  { cidade: "Açailândia", estado: "MA", bairros: ["Centro", "Vila Ildemar", "Jacu", "Parque das Nações", "Bom Jesus", "Vila Bom Sucesso"] },
  { cidade: "Balsas", estado: "MA", bairros: ["Centro", "São Félix", "Potosi", "São Joaquim", "Vila Nova", "Brasília"] },
  { cidade: "Santa Inês", estado: "MA", bairros: ["Centro", "Cocos", "Maied", "Tabajara", "Cantinho do Céu"] },
  { cidade: "Pinheiro", estado: "MA", bairros: ["Centro", "São Benedito", "Mercado", "Quinta", "Matriz"] },
  { cidade: "São José de Ribamar", estado: "MA", bairros: ["Centro", "Miritiua", "Vila Nina", "Jaracaty", "Maioba"] },
  { cidade: "Paço do Lumiar", estado: "MA", bairros: ["Centro", "Maiobão", "Pingüela", "Iguaíba"] },
  { cidade: "Chapadinha", estado: "MA", bairros: ["Centro", "Bom Jesus", "Frades", "Trizidela", "Cana Brava"] },
  { cidade: "Barra do Corda", estado: "MA", bairros: ["Centro", "Altamira", "São Raimundo", "Aeroporto", "Nova Tijoca"] },

  // =====================================================================
  // SUDESTE (interior e região metropolitana)
  // =====================================================================
  // --- São Paulo ---
  { cidade: "Santo André", estado: "SP", bairros: ["Centro", "Vila Assunção", "Jardim", "Utinga", "Vila Luzita", "Camilópolis", "Paranapiacaba"] },
  { cidade: "São Bernardo do Campo", estado: "SP", bairros: ["Centro", "Rudge Ramos", "Demarchi", "Baeta Neves", "Assunção", "Ferrazópolis"] },
  { cidade: "Osasco", estado: "SP", bairros: ["Centro", "Vila Yara", "Bela Vista", "Km 18", "Jardim das Flores", "Presidente Altino"] },
  { cidade: "Santos", estado: "SP", bairros: ["Centro", "Gonzaga", "Boqueirão", "Ponta da Praia", "Aparecida", "Embaré", "José Menino", "Campo Grande"] },
  { cidade: "Sorocaba", estado: "SP", bairros: ["Centro", "Campolim", "Jardim Vergueiro", "Éden", "Vila Hortência", "Além Ponte", "Mangal"] },
  { cidade: "Ribeirão Preto", estado: "SP", bairros: ["Centro", "Jardim Paulista", "Campos Elíseos", "Vila Tibério", "Ipiranga", "Sumarezinho", "Jardim Sumaré"] },
  { cidade: "São José dos Campos", estado: "SP", bairros: ["Centro", "Jardim Aquarius", "Vila Adyana", "Jardim Satélite", "Urbanova", "Vila Ema"] },
  { cidade: "São José do Rio Preto", estado: "SP", bairros: ["Centro", "Boa Vista", "Higienópolis", "Redentora", "Vila Toninho", "Santo Antônio"] },
  { cidade: "Bauru", estado: "SP", bairros: ["Centro", "Vila Falcão", "Jardim Bela Vista", "Otávio Rasi", "Vila Universitária"] },
  { cidade: "Piracicaba", estado: "SP", bairros: ["Centro", "Paulista", "Vila Rezende", "São Dimas", "Cidade Alta"] },
  { cidade: "Jundiaí", estado: "SP", bairros: ["Centro", "Anhangabaú", "Vila Arens", "Jardim Messina", "Ponte São João"] },
  { cidade: "Franca", estado: "SP", bairros: ["Centro", "Cidade Nova", "Jardim Petráglia", "São Joaquim", "Vila Aparecida"] },
  { cidade: "Presidente Prudente", estado: "SP", bairros: ["Centro", "Vila Marcondes", "Jardim Bongiovani", "Parque Alvorada"] },
  { cidade: "Taubaté", estado: "SP", bairros: ["Centro", "Independência", "Jardim das Nações", "Estiva", "Jardim Santa Helena"] },
  // --- Minas Gerais ---
  { cidade: "Uberlândia", estado: "MG", bairros: ["Centro", "Santa Mônica", "Tibery", "Tabajaras", "Martins", "Jardim Brasília", "Roosevelt", "Saraiva"] },
  { cidade: "Contagem", estado: "MG", bairros: ["Centro", "Eldorado", "Industrial", "Ressaca", "Nacional", "Cidade Industrial"] },
  { cidade: "Juiz de Fora", estado: "MG", bairros: ["Centro", "São Mateus", "Santa Helena", "Cascatinha", "Granbery", "Benfica"] },
  { cidade: "Betim", estado: "MG", bairros: ["Centro", "Jardim Teresópolis", "Citrolândia", "Icaivera", "PTB"] },
  { cidade: "Montes Claros", estado: "MG", bairros: ["Centro", "Major Prates", "Maracanã", "Todos os Santos", "Cândida Câmara"] },
  { cidade: "Uberaba", estado: "MG", bairros: ["Centro", "Fabrício", "Boa Vista", "Santa Marta", "Mercês"] },
  { cidade: "Governador Valadares", estado: "MG", bairros: ["Centro", "Grã-Duquesa", "Vila Bretas", "São Pedro", "Lourdes"] },
  { cidade: "Ipatinga", estado: "MG", bairros: ["Centro", "Cidade Nobre", "Bom Retiro", "Veneza", "Canaã"] },
  { cidade: "Divinópolis", estado: "MG", bairros: ["Centro", "Niterói", "São José", "Sidil", "Bom Pastor"] },
  // --- Rio de Janeiro ---
  { cidade: "Niterói", estado: "RJ", bairros: ["Centro", "Icaraí", "Santa Rosa", "São Francisco", "Fonseca", "Barreto", "Ingá", "Itaipu"] },
  { cidade: "São Gonçalo", estado: "RJ", bairros: ["Centro", "Alcântara", "Neves", "Mutondo", "Zé Garoto", "Trindade"] },
  { cidade: "Duque de Caxias", estado: "RJ", bairros: ["Centro", "Jardim Primavera", "Saracuruna", "Campos Elíseos", "Vila São Luís"] },
  { cidade: "Nova Iguaçu", estado: "RJ", bairros: ["Centro", "Comendador Soares", "Austin", "Posse", "Califórnia"] },
  { cidade: "Campos dos Goytacazes", estado: "RJ", bairros: ["Centro", "Pelinca", "Parque Tamandaré", "Jardim Carioca", "Guarus"] },
  { cidade: "Petrópolis", estado: "RJ", bairros: ["Centro", "Itaipava", "Quitandinha", "Bingen", "Cascatinha"] },
  { cidade: "Volta Redonda", estado: "RJ", bairros: ["Centro", "Aterrado", "Vila Santa Cecília", "Retiro", "Jardim Amália"] },
  { cidade: "Macaé", estado: "RJ", bairros: ["Centro", "Imbetiba", "Riviera", "Cavaleiros", "Glória"] },
  { cidade: "Cabo Frio", estado: "RJ", bairros: ["Centro", "Passagem", "Braga", "São Bento", "Jardim Esperança"] },
  // --- Espírito Santo ---
  { cidade: "Vila Velha", estado: "ES", bairros: ["Centro", "Praia da Costa", "Itaparica", "Coqueiral de Itaparica", "Glória", "Cobilândia", "Itapuã"] },
  { cidade: "Serra", estado: "ES", bairros: ["Centro", "Laranjeiras", "Jardim Limoeiro", "Serra Dourada", "Feu Rosa", "Manguinhos"] },
  { cidade: "Cariacica", estado: "ES", bairros: ["Centro", "Campo Grande", "Jardim América", "Itacibá", "Alto Lage"] },
  { cidade: "Cachoeiro de Itapemirim", estado: "ES", bairros: ["Centro", "Guandu", "Independência", "Aeroporto", "Gilberto Machado"] },

  // =====================================================================
  // SUL (interior e região metropolitana)
  // =====================================================================
  // --- Paraná ---
  { cidade: "Londrina", estado: "PR", bairros: ["Centro", "Gleba Palhano", "Jardim Shangri-lá", "Vila Nova", "Zona Norte", "Cinco Conjuntos"] },
  { cidade: "Maringá", estado: "PR", bairros: ["Centro", "Zona 7", "Jardim Alvorada", "Vila Operária", "Novo Centro", "Zona 5"] },
  { cidade: "Ponta Grossa", estado: "PR", bairros: ["Centro", "Uvaranas", "Oficinas", "Nova Rússia", "Olarias"] },
  { cidade: "Cascavel", estado: "PR", bairros: ["Centro", "Coqueiral", "Brasília", "Cancelli", "Pioneiros Catarinenses"] },
  { cidade: "Foz do Iguaçu", estado: "PR", bairros: ["Centro", "Vila Portes", "Jardim América", "Três Lagoas", "Porto Meira"] },
  { cidade: "São José dos Pinhais", estado: "PR", bairros: ["Centro", "Afonso Pena", "Costeira", "Cidade Jardim", "Borda do Campo"] },
  { cidade: "Colombo", estado: "PR", bairros: ["Centro", "Maria Antonieta", "Guaraituba", "São Gabriel", "Rio Verde"] },
  { cidade: "Guarapuava", estado: "PR", bairros: ["Centro", "Santa Cruz", "Batel", "Trianon", "Bonsucesso"] },
  // --- Santa Catarina ---
  { cidade: "Joinville", estado: "SC", bairros: ["Centro", "América", "Glória", "Costa e Silva", "Bucarein", "Iririú", "Boa Vista"] },
  { cidade: "Blumenau", estado: "SC", bairros: ["Centro", "Velha", "Garcia", "Itoupava", "Vorstadt", "Ponta Aguda"] },
  { cidade: "Chapecó", estado: "SC", bairros: ["Centro", "Maria Goretti", "Efapi", "São Cristóvão", "Passo dos Fortes"] },
  { cidade: "Itajaí", estado: "SC", bairros: ["Centro", "Fazenda", "Cordeiros", "São João", "Itaipava"] },
  { cidade: "Criciúma", estado: "SC", bairros: ["Centro", "Próspera", "Pinheirinho", "Michel", "Santa Bárbara"] },
  { cidade: "São José", estado: "SC", bairros: ["Campinas", "Kobrasol", "Barreiros", "Forquilhinhas", "Areias"] },
  { cidade: "Balneário Camboriú", estado: "SC", bairros: ["Centro", "Pioneiros", "Nações", "Barra", "Estados"] },
  { cidade: "Lages", estado: "SC", bairros: ["Centro", "Coral", "Habitação", "Guarujá", "São Cristóvão"] },
  // --- Rio Grande do Sul ---
  { cidade: "Caxias do Sul", estado: "RS", bairros: ["Centro", "São Pelegrino", "Pio X", "Exposição", "Cidade Nova", "Panazzolo"] },
  { cidade: "Pelotas", estado: "RS", bairros: ["Centro", "Areal", "Fragata", "Três Vendas", "Laranjal"] },
  { cidade: "Canoas", estado: "RS", bairros: ["Centro", "Niterói", "Mathias Velho", "Igara", "Marechal Rondon"] },
  { cidade: "Santa Maria", estado: "RS", bairros: ["Centro", "Camobi", "Nossa Senhora de Lourdes", "Patronato", "Itararé"] },
  { cidade: "Novo Hamburgo", estado: "RS", bairros: ["Centro", "Rio Branco", "Hamburgo Velho", "Canudos", "Liberdade"] },
  { cidade: "Passo Fundo", estado: "RS", bairros: ["Centro", "Boqueirão", "Petrópolis", "São Cristóvão", "Vera Cruz"] },
  { cidade: "Rio Grande", estado: "RS", bairros: ["Centro", "Cidade Nova", "Cassino", "Parque Marinha", "Junção"] },
  { cidade: "Gravataí", estado: "RS", bairros: ["Centro", "Bom Sucesso", "Morungava", "Parque dos Anjos", "Barnabé"] },

  // =====================================================================
  // CENTRO-OESTE (interior)
  // =====================================================================
  { cidade: "Aparecida de Goiânia", estado: "GO", bairros: ["Centro", "Vila Brasília", "Jardim Tiradentes", "Garavelo", "Cidade Livre", "Buriti Sereno"] },
  { cidade: "Anápolis", estado: "GO", bairros: ["Centro", "Jundiaí", "Vila Jaiara", "Maracanã", "Bairro de Lourdes"] },
  { cidade: "Rio Verde", estado: "GO", bairros: ["Centro", "Vila Borges", "Jardim Goiás", "Pauzanes", "Morada do Sol"] },
  { cidade: "Luziânia", estado: "GO", bairros: ["Centro", "Jardim Ingá", "Parque Estrela Dalva", "Mingone"] },
  { cidade: "Várzea Grande", estado: "MT", bairros: ["Centro", "Cristo Rei", "Mapim", "Glória", "Costa Verde"] },
  { cidade: "Rondonópolis", estado: "MT", bairros: ["Centro", "Vila Aurora", "Jardim Liberdade", "Sagrada Família", "Vila Birigui"] },
  { cidade: "Sinop", estado: "MT", bairros: ["Centro", "Jardim Botânico", "Setor Industrial", "Jardim Primavera", "Menino Jesus"] },
  { cidade: "Dourados", estado: "MS", bairros: ["Centro", "Jardim Água Boa", "Vila Planalto", "Jardim Caramanã", "BNH"] },
  { cidade: "Três Lagoas", estado: "MS", bairros: ["Centro", "Vila Piloto", "Santa Luzia", "Jardim Alvorada"] },
  { cidade: "Corumbá", estado: "MS", bairros: ["Centro", "Cervejaria", "Aeroporto", "Universitário", "Popular Nova"] },

  // =====================================================================
  // NORTE (capitais que faltavam + interior)
  // =====================================================================
  { cidade: "Palmas", estado: "TO", bairros: ["Plano Diretor Sul", "Plano Diretor Norte", "Taquaralto", "Aureny I", "Aureny III", "Taquaruçu", "Jardim Aureny"] },
  { cidade: "Araguaína", estado: "TO", bairros: ["Centro", "JK", "São João", "Vila Couto Magalhães", "Setor Anhanguera"] },
  { cidade: "Gurupi", estado: "TO", bairros: ["Centro", "Vila Nova", "Sol Nascente", "Waldir Lins", "Alto da Boa Vista"] },
  { cidade: "Rio Branco", estado: "AC", bairros: ["Centro", "Bosque", "Cidade Nova", "Floresta", "Conjunto Tucumã", "Vila Acre", "Aviário"] },
  { cidade: "Cruzeiro do Sul", estado: "AC", bairros: ["Centro", "Miritizal", "Aeroporto Velho", "Cruzeirão", "Telégrafo"] },
  { cidade: "Boa Vista", estado: "RR", bairros: ["Centro", "São Francisco", "Caçari", "Paraviana", "Aparecida", "Pricumã", "Cidade Satélite"] },
  { cidade: "Macapá", estado: "AP", bairros: ["Centro", "Trem", "Santa Rita", "Pacoval", "Buritizal", "Jardim Felicidade", "Cabralzinho"] },
  { cidade: "Santana", estado: "AP", bairros: ["Centro", "Nova Brasília", "Provedor", "Fonte Nova", "Paraíso"] },
  { cidade: "Ananindeua", estado: "PA", bairros: ["Centro", "Cidade Nova", "Coqueiro", "Águas Lindas", "Icuí", "Maguari"] },
  { cidade: "Santarém", estado: "PA", bairros: ["Centro", "Aparecida", "Santa Clara", "Prainha", "Liberdade", "Aldeia"] },
  { cidade: "Marabá", estado: "PA", bairros: ["Cidade Nova", "Nova Marabá", "Velha Marabá", "São Félix", "Cabelo Seco"] },
  { cidade: "Castanhal", estado: "PA", bairros: ["Centro", "Jaderlândia", "Caiçara", "Nova Olinda", "Saudade"] },
  { cidade: "Parauapebas", estado: "PA", bairros: ["Cidade Nova", "Rio Verde", "União", "Beira Rio", "Liberdade"] },
  { cidade: "Parintins", estado: "AM", bairros: ["Centro", "Palmares", "São José", "Itaúna", "Djard Vieira"] },
  { cidade: "Itacoatiara", estado: "AM", bairros: ["Centro", "Jauary", "Colônia", "Mamoud Amed", "Eduardo Braga"] },
  { cidade: "Ji-Paraná", estado: "RO", bairros: ["Centro", "Nova Brasília", "Jardim Aurélio", "Casa Preta", "Dois de Abril"] },
  { cidade: "Ariquemes", estado: "RO", bairros: ["Centro", "Setor 01", "Jardim Jorge Teixeira", "Áreas Especiais", "Setor 03"] },
  { cidade: "Vilhena", estado: "RO", bairros: ["Centro", "Jardim América", "Cristo Rei", "Bodanese", "Bela Vista"] },

  // =====================================================================
  // NORDESTE (regiões metropolitanas e mais interior)
  // =====================================================================
  { cidade: "Camaçari", estado: "BA", bairros: ["Centro", "Gleba A", "Gleba B", "Phoc", "Natal", "Verdes Horizontes"] },
  { cidade: "Lauro de Freitas", estado: "BA", bairros: ["Centro", "Itinga", "Vida Nova", "Pitangueiras", "Vilas do Atlântico"] },
  { cidade: "Teixeira de Freitas", estado: "BA", bairros: ["Centro", "Bela Vista", "São Lourenço", "Liberdade", "Kaikan"] },
  { cidade: "Eunápolis", estado: "BA", bairros: ["Centro", "Dinah Borges", "Juca Rosa", "Alecrim", "Pequi"] },
  { cidade: "Olinda", estado: "PE", bairros: ["Centro", "Bairro Novo", "Casa Caiada", "Rio Doce", "Peixinhos", "Jardim Atlântico"] },
  { cidade: "Jaboatão dos Guararapes", estado: "PE", bairros: ["Centro", "Piedade", "Candeias", "Prazeres", "Cavaleiro", "Curado"] },
  { cidade: "Paulista", estado: "PE", bairros: ["Centro", "Janga", "Maranguape", "Pau Amarelo", "Nobre"] },
  { cidade: "Cabo de Santo Agostinho", estado: "PE", bairros: ["Centro", "Charneca", "Garapu", "Pontezinha", "Gaibu"] },
];
