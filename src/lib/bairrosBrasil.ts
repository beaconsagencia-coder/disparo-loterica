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

  // =====================================================================
  // EXPANSÃO 2 — +200 municípios (cobertura ampliada nacional)
  // =====================================================================
  // --- São Paulo ---
  { cidade: "Mauá", estado: "SP", bairros: ["Centro", "Vila Bocaina", "Jardim Zaíra", "Matriz", "Sônia Maria", "Vila Magini"] },
  { cidade: "Diadema", estado: "SP", bairros: ["Centro", "Eldorado", "Serraria", "Piraporinha", "Canhema", "Taboão"] },
  { cidade: "Carapicuíba", estado: "SP", bairros: ["Centro", "Vila Dirce", "Cohab", "Ariston", "Vila Caldas"] },
  { cidade: "Mogi das Cruzes", estado: "SP", bairros: ["Centro", "Mogilar", "Braz Cubas", "Vila Oliveira", "Jundiapeba", "César de Souza"] },
  { cidade: "São Caetano do Sul", estado: "SP", bairros: ["Centro", "Santa Paula", "Santo Antônio", "Barcelona", "Fundação"] },
  { cidade: "Itaquaquecetuba", estado: "SP", bairros: ["Centro", "Vila Virgínia", "Jardim Caiuby", "Monte Belo", "Vila Miranda"] },
  { cidade: "Suzano", estado: "SP", bairros: ["Centro", "Jardim Imperador", "Cidade Boa Vista", "Vila Amorim", "Jardim Revista"] },
  { cidade: "Barueri", estado: "SP", bairros: ["Centro", "Alphaville", "Jardim Belval", "Vila São Luiz", "Engenho Novo"] },
  { cidade: "Embu das Artes", estado: "SP", bairros: ["Centro", "Jardim Santo Eduardo", "Pinheirinho", "Jardim Vista Alegre", "Itatuba"] },
  { cidade: "Taboão da Serra", estado: "SP", bairros: ["Centro", "Jardim Maria Rosa", "Pirajussara", "Jardim Trindade", "Parque Pinheiros"] },
  { cidade: "Limeira", estado: "SP", bairros: ["Centro", "Vila Cláudia", "Jardim Glória", "São Camilo", "Vila Queiroz"] },
  { cidade: "Americana", estado: "SP", bairros: ["Centro", "Vila Santa Catarina", "Jardim São Paulo", "Cidade Jardim", "Antônio Zanaga"] },
  { cidade: "Indaiatuba", estado: "SP", bairros: ["Centro", "Cidade Nova", "Jardim Morada do Sol", "Vila Brizolla", "Itaici"] },
  { cidade: "Cotia", estado: "SP", bairros: ["Centro", "Granja Viana", "Jardim Nomura", "Caucaia do Alto", "Atalaia"] },
  { cidade: "Hortolândia", estado: "SP", bairros: ["Centro", "Jardim Amanda", "Remanso Campineiro", "Nova Hortolândia", "Jardim Rosolém"] },
  { cidade: "Sumaré", estado: "SP", bairros: ["Centro", "Matão", "Nova Veneza", "Jardim Bela Vista", "Maria Antônia"] },
  { cidade: "Rio Claro", estado: "SP", bairros: ["Centro", "Cidade Nova", "Jardim São Paulo", "Santana", "Vila Aparecida"] },
  { cidade: "Araçatuba", estado: "SP", bairros: ["Centro", "Vila Mendonça", "Jardim Sumaré", "Aviação", "Higienópolis"] },
  { cidade: "Jacareí", estado: "SP", bairros: ["Centro", "Jardim Califórnia", "Cidade Salvador", "Parque Meia Lua", "Igapó"] },
  { cidade: "Praia Grande", estado: "SP", bairros: ["Boqueirão", "Guilhermina", "Aviação", "Tupi", "Ocian", "Mirim"] },
  { cidade: "São Vicente", estado: "SP", bairros: ["Centro", "Itararé", "Gonzaguinha", "Catiapoã", "Parque São Vicente"] },
  { cidade: "Guarujá", estado: "SP", bairros: ["Centro", "Pitangueiras", "Enseada", "Astúrias", "Vila Santo Antônio"] },
  { cidade: "Marília", estado: "SP", bairros: ["Centro", "Fragata", "Cascata", "Maria Izabel", "Palmital"] },
  { cidade: "Bragança Paulista", estado: "SP", bairros: ["Centro", "Jardim América", "Lavapés", "Taboão", "Penha"] },
  { cidade: "Catanduva", estado: "SP", bairros: ["Centro", "Higienópolis", "Vila Motta", "Jardim Bela Vista", "São Domingos"] },

  // --- Minas Gerais ---
  { cidade: "Sete Lagoas", estado: "MG", bairros: ["Centro", "Jardim Cambuí", "Nova Cidade", "Catarina", "Eldorado"] },
  { cidade: "Poços de Caldas", estado: "MG", bairros: ["Centro", "Jardim dos Estados", "Country Club", "São Benedito", "Jardim Quisisana"] },
  { cidade: "Patos de Minas", estado: "MG", bairros: ["Centro", "Caiçaras", "Cidade Nova", "Jardim Esperança", "Lagoinha"] },
  { cidade: "Pouso Alegre", estado: "MG", bairros: ["Centro", "São Geraldo", "Fátima", "Jardim Aeroporto", "Cidade Jardim"] },
  { cidade: "Teófilo Otoni", estado: "MG", bairros: ["Centro", "Marajoara", "Funcionários", "São Jacinto", "Grão Pará"] },
  { cidade: "Barbacena", estado: "MG", bairros: ["Centro", "Pontilhão", "São Sebastião", "Boa Morte", "Caiçaras"] },
  { cidade: "Sabará", estado: "MG", bairros: ["Centro", "Pompéu", "Esplanada", "Roça Grande", "Morada da Serra"] },
  { cidade: "Varginha", estado: "MG", bairros: ["Centro", "Vila Pinto", "Jardim Andere", "Sion", "Boa Vista"] },
  { cidade: "Conselheiro Lafaiete", estado: "MG", bairros: ["Centro", "Rocila", "Carijós", "Nossa Senhora de Fátima", "São João"] },
  { cidade: "Vespasiano", estado: "MG", bairros: ["Centro", "Caieiras", "Morro Alto", "Jardim Itália", "Nova Pampulha"] },
  { cidade: "Itabira", estado: "MG", bairros: ["Centro", "Pedreira", "Areão", "Campestre", "Penha"] },
  { cidade: "Araguari", estado: "MG", bairros: ["Centro", "Bosque", "Goiás", "Síria", "Independência"] },
  { cidade: "Passos", estado: "MG", bairros: ["Centro", "Belo Horizonte", "Penha", "Aparecida", "Santa Luzia"] },
  { cidade: "Coronel Fabriciano", estado: "MG", bairros: ["Centro", "Giovannini", "Amaro Lanari", "Caladão", "Todos os Santos"] },
  { cidade: "Muriaé", estado: "MG", bairros: ["Centro", "Barra", "Safira", "São Joaquim", "Bom Pastor"] },
  { cidade: "Ituiutaba", estado: "MG", bairros: ["Centro", "Tupã", "Progresso", "Novo Tempo II", "Carvalho"] },
  { cidade: "Lavras", estado: "MG", bairros: ["Centro", "Jardim Glória", "Vila Esperança", "Aquenta Sol", "Funcionários"] },
  { cidade: "Nova Lima", estado: "MG", bairros: ["Centro", "Vila da Serra", "Cruzeiro", "Jardim Canadá", "Vale do Sereno"] },

  // --- Rio de Janeiro ---
  { cidade: "Belford Roxo", estado: "RJ", bairros: ["Centro", "Lote XV", "Heliópolis", "São Bernardo", "Bom Pastor"] },
  { cidade: "São João de Meriti", estado: "RJ", bairros: ["Centro", "Vilar dos Teles", "Coelho da Rocha", "Jardim Meriti", "São Mateus"] },
  { cidade: "Magé", estado: "RJ", bairros: ["Centro", "Piabetá", "Vila Inhomirim", "Fragoso", "Santo Aleixo"] },
  { cidade: "Itaboraí", estado: "RJ", bairros: ["Centro", "Venda das Pedras", "Manilha", "Reta Velha", "Sambaetiba"] },
  { cidade: "Mesquita", estado: "RJ", bairros: ["Centro", "Rocha Sobrinho", "Edson Passos", "Jacutinga", "Banco de Areia"] },
  { cidade: "Nilópolis", estado: "RJ", bairros: ["Centro", "Olinda", "Frigorífico", "Nova Cidade", "Cabuís"] },
  { cidade: "Queimados", estado: "RJ", bairros: ["Centro", "Vila Pacaembu", "São Roque", "Fanchem", "Inconfidência"] },
  { cidade: "Nova Friburgo", estado: "RJ", bairros: ["Centro", "Olaria", "Conselheiro Paulino", "Cordoeira", "Jardim Califórnia"] },
  { cidade: "Barra Mansa", estado: "RJ", bairros: ["Centro", "Ano Bom", "Vila Nova", "Saudade", "Boa Sorte"] },
  { cidade: "Teresópolis", estado: "RJ", bairros: ["Centro", "Alto", "Várzea", "Agriões", "Soberbo"] },
  { cidade: "Resende", estado: "RJ", bairros: ["Centro", "Jardim Jalisco", "Manejo", "Campos Elíseos", "Cidade Alegria"] },
  { cidade: "Maricá", estado: "RJ", bairros: ["Centro", "Itaipuaçu", "São José do Imbassaí", "Inoã", "Flamengo"] },

  // --- Espírito Santo ---
  { cidade: "Linhares", estado: "ES", bairros: ["Centro", "Aviso", "Interlagos", "Três Barras", "Shell"] },
  { cidade: "Colatina", estado: "ES", bairros: ["Centro", "Maria das Graças", "São Silvano", "Marista", "Honório Fraga"] },
  { cidade: "Guarapari", estado: "ES", bairros: ["Centro", "Muquiçaba", "Praia do Morro", "Kubitschek", "Itapebussu"] },
  { cidade: "São Mateus", estado: "ES", bairros: ["Centro", "Boa Vista", "Litorâneo", "Sernamby", "Aroeira"] },
  { cidade: "Aracruz", estado: "ES", bairros: ["Centro", "Jequitibá", "Vila do Riacho", "Coqueiral", "Bela Vista"] },

  // --- Paraná ---
  { cidade: "Pinhais", estado: "PR", bairros: ["Centro", "Weissópolis", "Maria Antonieta", "Vargem Grande", "Atuba"] },
  { cidade: "Araucária", estado: "PR", bairros: ["Centro", "Capela Velha", "Fazenda Velha", "Cachoeira", "Costeira"] },
  { cidade: "Paranaguá", estado: "PR", bairros: ["Centro", "Rocio", "Costeira", "Jardim Iguaçu", "Vila Garcia"] },
  { cidade: "Toledo", estado: "PR", bairros: ["Centro", "Jardim Coopagro", "Vila Pioneiro", "Industrial", "Jardim Europa"] },
  { cidade: "Apucarana", estado: "PR", bairros: ["Centro", "Jardim Ponta Grossa", "Vila Nova", "Núcleo João Paulo", "Jardim Castelo Branco"] },
  { cidade: "Campo Largo", estado: "PR", bairros: ["Centro", "Vila Esperança", "Cercado", "Itaqui", "Jardim Sancho"] },
  { cidade: "Arapongas", estado: "PR", bairros: ["Centro", "Jardim Bandeirantes", "Vila Industrial", "Aplucas", "Jardim Tóquio"] },
  { cidade: "Almirante Tamandaré", estado: "PR", bairros: ["Centro", "Lamenha Grande", "Cachoeira", "Tanguá", "Areias"] },
  { cidade: "Umuarama", estado: "PR", bairros: ["Centro", "Zona I", "Zona II", "Jardim Cruzeiro", "Parque San Remo"] },
  { cidade: "Piraquara", estado: "PR", bairros: ["Centro", "Vila Macedo", "Guarituba", "Santa Mônica", "Jardim Primavera"] },
  { cidade: "Campo Mourão", estado: "PR", bairros: ["Centro", "Jardim Lar Paraná", "Vila Urupês", "Jardim Tropical", "Lar Paraná"] },
  { cidade: "Francisco Beltrão", estado: "PR", bairros: ["Centro", "Cango", "Industrial", "Padre Ulrico", "Alvorada"] },
  { cidade: "Pato Branco", estado: "PR", bairros: ["Centro", "Cristo Rei", "Bortot", "Industrial", "Planalto"] },
  { cidade: "Telêmaco Borba", estado: "PR", bairros: ["Centro", "Bom Jesus", "Socomim", "Nossa Senhora do Perpétuo Socorro", "Vila Esperança"] },

  // --- Santa Catarina ---
  { cidade: "Jaraguá do Sul", estado: "SC", bairros: ["Centro", "Vila Lalau", "Czerniewicz", "Baependi", "Vila Nova"] },
  { cidade: "Palhoça", estado: "SC", bairros: ["Centro", "Ponte do Imaruim", "Pagani", "Passa Vinte", "Bela Vista"] },
  { cidade: "Brusque", estado: "SC", bairros: ["Centro", "Santa Terezinha", "Águas Claras", "Dom Joaquim", "Azambuja"] },
  { cidade: "Tubarão", estado: "SC", bairros: ["Centro", "São João", "Oficinas", "Humaitá", "Dehon"] },
  { cidade: "Camboriú", estado: "SC", bairros: ["Centro", "Tabuleiro", "Cedro Alto", "Monte Alegre", "São Francisco de Assis"] },
  { cidade: "Navegantes", estado: "SC", bairros: ["Centro", "São Pedro", "Gravatá", "Machados", "Nossa Senhora das Graças"] },
  { cidade: "Concórdia", estado: "SC", bairros: ["Centro", "Nações", "Santa Cruz", "Industriários", "Petrópolis"] },
  { cidade: "Rio do Sul", estado: "SC", bairros: ["Centro", "Canoas", "Budag", "Bela Aliança", "Laranjeiras"] },
  { cidade: "Caçador", estado: "SC", bairros: ["Centro", "Berger", "Reunidas", "Champagnat", "Martello"] },
  { cidade: "São Bento do Sul", estado: "SC", bairros: ["Centro", "Serra Alta", "Rio Negro", "Colonial", "Centenário"] },
  { cidade: "Içara", estado: "SC", bairros: ["Centro", "Jussara", "Cristo Rei", "Liri", "Vila Nova"] },
  { cidade: "Gaspar", estado: "SC", bairros: ["Centro", "Bela Vista", "Sete de Setembro", "Coloninha", "Margem Esquerda"] },

  // --- Rio Grande do Sul ---
  { cidade: "Viamão", estado: "RS", bairros: ["Centro", "Tarumã", "Santa Isabel", "Jardim Krahe", "Viamópolis"] },
  { cidade: "São Leopoldo", estado: "RS", bairros: ["Centro", "Rio dos Sinos", "Cristo Rei", "Scharlau", "Feitoria"] },
  { cidade: "Sapucaia do Sul", estado: "RS", bairros: ["Centro", "São Jorge", "Santa Catarina", "Piratini", "Jardim América"] },
  { cidade: "Alvorada", estado: "RS", bairros: ["Centro", "Bela Vista", "Umbu", "Americana", "Jardim Algarve"] },
  { cidade: "Cachoeirinha", estado: "RS", bairros: ["Centro", "Vila City", "Parque Marechal Rondon", "Nossa Senhora Aparecida", "Vila Ponche Verde"] },
  { cidade: "Bagé", estado: "RS", bairros: ["Centro", "Getúlio Vargas", "Malafaia", "Promorar", "São Martim"] },
  { cidade: "Bento Gonçalves", estado: "RS", bairros: ["Centro", "Cidade Alta", "Botafogo", "São Bento", "Planalto"] },
  { cidade: "Erechim", estado: "RS", bairros: ["Centro", "Cristo Rei", "Atlântico", "Presidente Vargas", "Koller"] },
  { cidade: "Uruguaiana", estado: "RS", bairros: ["Centro", "São Marcos", "Cabo Luiz Pedroso", "Promorar", "Nova Esperança"] },
  { cidade: "Cachoeira do Sul", estado: "RS", bairros: ["Centro", "Fátima", "Bom Retiro", "Noêmia", "Santo Antônio"] },
  { cidade: "Lajeado", estado: "RS", bairros: ["Centro", "São Cristóvão", "Florestal", "Conventos", "Hidráulica"] },
  { cidade: "Ijuí", estado: "RS", bairros: ["Centro", "Modelo", "Storch", "Assis Brasil", "Jardim das Acácias"] },
  { cidade: "Esteio", estado: "RS", bairros: ["Centro", "Tamandaré", "Olímpica", "Parque Amador", "Novo Esteio"] },
  { cidade: "Farroupilha", estado: "RS", bairros: ["Centro", "São José", "Vila Rica", "Industrial", "Pio X"] },

  // --- Bahia ---
  { cidade: "Simões Filho", estado: "BA", bairros: ["Centro", "Cia", "Pitanguinha", "Dom Rômulo", "Nova Aliança"] },
  { cidade: "Santo Antônio de Jesus", estado: "BA", bairros: ["Centro", "Andaiá", "Irmã Dulce", "Cajueiro", "Urbis"] },
  { cidade: "Itapetinga", estado: "BA", bairros: ["Centro", "Vom Carro", "Bonfim", "Maria Pinheiro", "Jardim Brasil"] },
  { cidade: "Valença", estado: "BA", bairros: ["Centro", "Tento", "Bichara", "Graça", "Vila Guaibim"] },
  { cidade: "Candeias", estado: "BA", bairros: ["Centro", "Ouro Negro", "Capela", "Pitanga", "Itinga"] },
  { cidade: "Dias d'Ávila", estado: "BA", bairros: ["Centro", "Lapinha", "Itinga", "Mangabeira", "Recanto Feliz"] },
  { cidade: "Senhor do Bonfim", estado: "BA", bairros: ["Centro", "Alto do Cruzeiro", "Tijuaçu", "Bomfim", "Burgos"] },
  { cidade: "Serrinha", estado: "BA", bairros: ["Centro", "Cocão", "Maria Preta", "Aloísio", "Olho d'Água"] },
  { cidade: "Guanambi", estado: "BA", bairros: ["Centro", "Brasília", "Aeroporto", "Beira Rio", "Sandra Régia"] },
  { cidade: "Bom Jesus da Lapa", estado: "BA", bairros: ["Centro", "São Geraldo", "Bom Jesus", "Cristo Rei", "Antônio Balbino"] },
  { cidade: "Jacobina", estado: "BA", bairros: ["Centro", "Catuaba", "Serrinha", "Estação", "Itapeipu"] },
  { cidade: "Cruz das Almas", estado: "BA", bairros: ["Centro", "Ana Lúcia", "Suzana", "Bom Jardim", "Inocoop"] },

  // --- Pernambuco ---
  { cidade: "Camaragibe", estado: "PE", bairros: ["Centro", "Timbi", "Aldeia", "Bairro dos Estados", "Vera Cruz"] },
  { cidade: "São Lourenço da Mata", estado: "PE", bairros: ["Centro", "Tijucão", "Matriz", "Parque Capibaribe", "Várzea do Una"] },
  { cidade: "Igarassu", estado: "PE", bairros: ["Centro", "Cruz de Rebouças", "Nova Cruz", "Chave de Deus", "Mansões"] },
  { cidade: "Abreu e Lima", estado: "PE", bairros: ["Centro", "Caetés", "Timbó", "Fosfato", "Alto São Miguel"] },
  { cidade: "Gravatá", estado: "PE", bairros: ["Centro", "São Cristóvão", "Sítios Novos", "Cruzeiro", "Verde Morar"] },
  { cidade: "Belo Jardim", estado: "PE", bairros: ["Centro", "São Pedro", "Xucurus", "Bartolomeu", "Nossa Senhora do Rosário"] },
  { cidade: "Goiana", estado: "PE", bairros: ["Centro", "Carne de Vaca", "Tejucupapo", "Ponta de Pedras", "Macaracaba"] },
  { cidade: "Carpina", estado: "PE", bairros: ["Centro", "Jardim Aeroporto", "Cidade Jardim", "Riacho", "Nova Carpina"] },
  { cidade: "Pesqueira", estado: "PE", bairros: ["Centro", "Xucurus", "Bira Pereira", "São Cristóvão", "Conceição"] },
  { cidade: "Palmares", estado: "PE", bairros: ["Centro", "Cohab", "Bonança", "São Sebastião", "Aldeia Velha"] },

  // --- Ceará ---
  { cidade: "Crateús", estado: "CE", bairros: ["Centro", "Altamira", "Lmisa", "Venâncios", "Curtume"] },
  { cidade: "Pacatuba", estado: "CE", bairros: ["Centro", "Pavuna", "Monguba", "Itaitinga", "Goiabeiras"] },
  { cidade: "Quixeramobim", estado: "CE", bairros: ["Centro", "Senador Pompeu", "Aldeota", "Vila Nova", "Aragão"] },
  { cidade: "Aquiraz", estado: "CE", bairros: ["Centro", "Jacaúna", "Porto das Dunas", "Patacas", "Caponga"] },
  { cidade: "Russas", estado: "CE", bairros: ["Centro", "Flores", "Peixe", "Cohab", "Triângulo"] },
  { cidade: "Maranguape", estado: "CE", bairros: ["Centro", "Penedo", "Lameiro", "Tabatinga", "Itapebussu"] },
  { cidade: "Tianguá", estado: "CE", bairros: ["Centro", "Planalto", "Alto da Boa Vista", "Aeroporto", "Riacho Doce"] },
  { cidade: "Limoeiro do Norte", estado: "CE", bairros: ["Centro", "Cidade Alta", "Sup", "Bicame", "Quixere"] },
  { cidade: "Canindé", estado: "CE", bairros: ["Centro", "Boa Vista", "Alto São Francisco", "Palestina", "Várzea"] },
  { cidade: "Pacajus", estado: "CE", bairros: ["Centro", "Croatá", "Pavuna", "Belém", "Jaçanaú"] },

  // --- Maranhão ---
  { cidade: "Pedreiras", estado: "MA", bairros: ["Centro", "São José", "Mutirão", "Trizidela do Vale", "Beira Rio"] },
  { cidade: "Coroatá", estado: "MA", bairros: ["Centro", "São Benedito", "São Francisco", "Vila Nova", "Mutirão"] },
  { cidade: "Grajaú", estado: "MA", bairros: ["Centro", "Cohab", "Boa Vista", "Vila Nova", "Aeroporto"] },
  { cidade: "Itapecuru-Mirim", estado: "MA", bairros: ["Centro", "Bom Jesus", "Vila Nova", "Conceição", "Cana Brava"] },
  { cidade: "Presidente Dutra", estado: "MA", bairros: ["Centro", "Aeroporto", "São José", "Vila Nova", "Cohab"] },
  { cidade: "Buriticupu", estado: "MA", bairros: ["Centro", "Vila Mansueto", "Bom Jesus", "Aeroporto", "Vila Bom Viver"] },
  { cidade: "Zé Doca", estado: "MA", bairros: ["Centro", "São Francisco", "Vila Nova", "Bom Jesus", "Maranhão Novo"] },
  { cidade: "Santa Luzia", estado: "MA", bairros: ["Centro", "Bom Jesus", "Vila Nova", "São Raimundo", "Cohab"] },
  { cidade: "Vargem Grande", estado: "MA", bairros: ["Centro", "São Benedito", "Vila Nova", "Mutirão", "Fátima"] },
  { cidade: "São João dos Patos", estado: "MA", bairros: ["Centro", "Bequimão", "Vila Nova", "Boa Esperança", "Trecho"] },

  // --- Paraíba ---
  { cidade: "Santa Rita", estado: "PB", bairros: ["Centro", "Tibiri", "Várzea Nova", "Marcos Moura", "Cuiá"] },
  { cidade: "Bayeux", estado: "PB", bairros: ["Centro", "São Bento", "Jardim Aeroporto", "Sesi", "Alto da Boa Vista"] },
  { cidade: "Cabedelo", estado: "PB", bairros: ["Centro", "Intermares", "Camboinha", "Jardim Manguinhos", "Ponta de Campina"] },
  { cidade: "Sapé", estado: "PB", bairros: ["Centro", "São José", "Mutirão", "Aurora", "Bela Vista"] },
  { cidade: "Mamanguape", estado: "PB", bairros: ["Centro", "Bonito", "São José", "Cristo Rei", "Tertuliano"] },
  { cidade: "Pombal", estado: "PB", bairros: ["Centro", "Bairro Novo", "Salgadinho", "Bela Vista", "São Gregório"] },
  { cidade: "Monteiro", estado: "PB", bairros: ["Centro", "Alto da Boa Vista", "Vila Santa Maria", "Manaíra", "Bela Vista"] },
  { cidade: "Catolé do Rocha", estado: "PB", bairros: ["Centro", "Bela Vista", "São José", "Cuncas", "Bom Sucesso"] },

  // --- Rio Grande do Norte ---
  { cidade: "São Gonçalo do Amarante", estado: "RN", bairros: ["Centro", "Jardim Lola", "Santo Antônio do Potengi", "Novo Amarante", "Regomoleiro"] },
  { cidade: "Macaíba", estado: "RN", bairros: ["Centro", "Campo das Mangueiras", "Cana Brava", "Mangabeira", "Castor Vieira"] },
  { cidade: "Ceará-Mirim", estado: "RN", bairros: ["Centro", "Boa Vista", "Maçaranduba", "Cibração", "Salinas"] },
  { cidade: "Apodi", estado: "RN", bairros: ["Centro", "Vila Nova", "Abackground", "São Pedro", "Belo Horizonte"] },
  { cidade: "Pau dos Ferros", estado: "RN", bairros: ["Centro", "Manoel Domingos", "São Benedito", "Riacho do Meio", "Nações Unidas"] },
  { cidade: "Santa Cruz", estado: "RN", bairros: ["Centro", "DNER", "Paraíso", "Boa Esperança", "Cônego Monte"] },
  { cidade: "João Câmara", estado: "RN", bairros: ["Centro", "Tabajara", "Aluízio Bezerra", "Maria Camila", "Bela Vista"] },

  // --- Piauí ---
  { cidade: "Campo Maior", estado: "PI", bairros: ["Centro", "São Luís", "Tabuleta", "Mutirão", "Cacimba Velha"] },
  { cidade: "Barras", estado: "PI", bairros: ["Centro", "São Sebastião", "Mutirão", "Alegre", "Caixa d'Água"] },
  { cidade: "Altos", estado: "PI", bairros: ["Centro", "Aroeiras", "São José", "Mocambinho", "Cacimbas"] },
  { cidade: "Esperantina", estado: "PI", bairros: ["Centro", "Mutirão", "São Raimundo", "Boa Esperança", "Cohab"] },
  { cidade: "Oeiras", estado: "PI", bairros: ["Centro", "Pomar", "Boa Esperança", "Junco", "Alto da Vitória"] },
  { cidade: "José de Freitas", estado: "PI", bairros: ["Centro", "Mafrense", "São José", "Aroeiras", "Curralinho"] },
  { cidade: "São Raimundo Nonato", estado: "PI", bairros: ["Centro", "Aldeia", "Campo Novo", "São Vicente", "Saco"] },

  // --- Alagoas ---
  { cidade: "Coruripe", estado: "AL", bairros: ["Centro", "Pontal do Coruripe", "Brasília", "Buenos Aires", "Pov. Miaí"] },
  { cidade: "Marechal Deodoro", estado: "AL", bairros: ["Centro", "Massagueira", "Taperaguá", "Carro Quebrado", "Poeira"] },
  { cidade: "Delmiro Gouveia", estado: "AL", bairros: ["Centro", "Bom Conselho", "Pau Ferro", "Eldorado", "Pereira"] },
  { cidade: "Campo Alegre", estado: "AL", bairros: ["Centro", "Jardim Alagoas", "Bebedouro", "Antônio Lins", "Vila Nova"] },
  { cidade: "Santana do Ipanema", estado: "AL", bairros: ["Centro", "Vila Nova", "Alto da Boa Vista", "Tabuleiro", "Cohab"] },
  { cidade: "São Miguel dos Campos", estado: "AL", bairros: ["Centro", "Tabuleiro", "Maravilha", "Coqueiro", "Mutirão"] },

  // --- Sergipe ---
  { cidade: "São Cristóvão", estado: "SE", bairros: ["Centro", "Rosa Elze", "Eduardo Gomes", "Cidade Universitária", "Tijuquinha"] },
  { cidade: "Itabaianinha", estado: "SE", bairros: ["Centro", "Cohab", "Alto da Boa Vista", "Sítio", "Vila Nova"] },
  { cidade: "Simão Dias", estado: "SE", bairros: ["Centro", "Bomfim", "Pratas", "Cohab", "Alto da Boa Vista"] },
  { cidade: "Propriá", estado: "SE", bairros: ["Centro", "Bairro Novo", "São José", "Frei Fabiano", "Cohab"] },
  { cidade: "Capela", estado: "SE", bairros: ["Centro", "Cumbe", "São José", "Vila Nova", "Tabocas"] },

  // --- Goiás ---
  { cidade: "Águas Lindas de Goiás", estado: "GO", bairros: ["Centro", "Jardim Brasília", "Mansões", "Vila Roma", "Setor 1"] },
  { cidade: "Valparaíso de Goiás", estado: "GO", bairros: ["Centro", "Esplanada", "Céu Azul", "Jardim Oriente", "Marajó"] },
  { cidade: "Trindade", estado: "GO", bairros: ["Centro", "Setor Tradicional", "Jardim Salvador", "Maria Dilce", "Vila Mariana"] },
  { cidade: "Formosa", estado: "GO", bairros: ["Centro", "Parque Lago", "Santa Luzia", "Formosinha", "Vila Aparecida"] },
  { cidade: "Novo Gama", estado: "GO", bairros: ["Centro", "Pedregal", "Lunabel", "Céu Azul", "Jardim Vivian"] },
  { cidade: "Senador Canedo", estado: "GO", bairros: ["Centro", "Jardim das Oliveiras", "Morada do Bosque", "São José", "Vila Bonsucesso"] },
  { cidade: "Catalão", estado: "GO", bairros: ["Centro", "Santa Cruz", "Bandeirantes", "Pio XII", "Ipanema"] },
  { cidade: "Itumbiara", estado: "GO", bairros: ["Centro", "Bandeirantes", "Alvorada", "São José", "Veredas"] },
  { cidade: "Jataí", estado: "GO", bairros: ["Centro", "Santa Maria", "Vila Fátima", "Jardim Goiás", "Popular"] },
  { cidade: "Caldas Novas", estado: "GO", bairros: ["Centro", "Itaguaí", "Jardim Belvedere", "Turista", "Solar de Caldas"] },

  // --- Mato Grosso ---
  { cidade: "Tangará da Serra", estado: "MT", bairros: ["Centro", "Jardim Tarumã", "Vila Alta", "Jardim Europa", "Jardim Paraíso"] },
  { cidade: "Cáceres", estado: "MT", bairros: ["Centro", "Cavalhada", "Jardim Padre Paulo", "Cohab Velha", "Vila Mariana"] },
  { cidade: "Sorriso", estado: "MT", bairros: ["Centro", "Bom Jesus", "Jardim Itália", "Industrial", "Bela Vista"] },
  { cidade: "Lucas do Rio Verde", estado: "MT", bairros: ["Centro", "Cidade Nova", "Parque das Emas", "Bandeirantes", "Menino Deus"] },
  { cidade: "Primavera do Leste", estado: "MT", bairros: ["Centro", "Primavera II", "Jardim Riva", "Tropical", "Castelândia"] },
  { cidade: "Barra do Garças", estado: "MT", bairros: ["Centro", "Vila Maria", "Jardim Nova Barra", "São José", "Santo Antônio"] },
  { cidade: "Alta Floresta", estado: "MT", bairros: ["Centro", "Cidade Alta", "Jardim Primavera", "Bom Jesus", "Boa Nova"] },

  // --- Mato Grosso do Sul ---
  { cidade: "Ponta Porã", estado: "MS", bairros: ["Centro", "Jardim Aeroporto", "Granja", "Maria Auxiliadora", "Itamarati"] },
  { cidade: "Naviraí", estado: "MS", bairros: ["Centro", "Jardim Paraíso", "Boa Vista", "Jardim Progresso", "Interlagos"] },
  { cidade: "Nova Andradina", estado: "MS", bairros: ["Centro", "Jardim Aeroporto", "Vila Eures", "Maristela", "Bela Vista"] },
  { cidade: "Aquidauana", estado: "MS", bairros: ["Centro", "Alto", "Guanandy", "Nova Aquidauana", "Santa Terezinha"] },
  { cidade: "Sidrolândia", estado: "MS", bairros: ["Centro", "Vila Margarida", "Jardim Aeroporto", "MÁfrica", "Santos Dumont"] },
  { cidade: "Maracaju", estado: "MS", bairros: ["Centro", "Jardim Santa Cruz", "Bandeirantes", "Olarias", "Vila Juquita"] },

  // --- Pará ---
  { cidade: "Abaetetuba", estado: "PA", bairros: ["Centro", "São João", "Algodoal", "Mutirão", "Aviação"] },
  { cidade: "Cametá", estado: "PA", bairros: ["Centro", "São Benedito", "Aldeia", "Cidade Nova", "Brasília"] },
  { cidade: "Bragança", estado: "PA", bairros: ["Centro", "Aldeia", "Riozinho", "Vila Sinhá", "Padre Luiz"] },
  { cidade: "Altamira", estado: "PA", bairros: ["Centro", "Brasília", "Jardim Independente", "Premem", "Esplanada do Xingu"] },
  { cidade: "Tucuruí", estado: "PA", bairros: ["Centro", "Jardim Paraíso", "Vila Permanente", "Santa Mônica", "Mangal"] },
  { cidade: "Itaituba", estado: "PA", bairros: ["Centro", "Maria Madalena", "Bela Vista", "Liberdade", "São José Operário"] },
  { cidade: "Barcarena", estado: "PA", bairros: ["Centro", "Vila dos Cabanos", "Laranjal", "Pioneiro", "Itupanema"] },
  { cidade: "Paragominas", estado: "PA", bairros: ["Centro", "Célio Miranda", "Promissão", "Jardim Bela Vista", "Nagibão"] },
  { cidade: "Capanema", estado: "PA", bairros: ["Centro", "São Cristóvão", "Boa Vista", "Vila Nova", "Camboinha"] },

  // --- Amazonas ---
  { cidade: "Manacapuru", estado: "AM", bairros: ["Centro", "Morada do Sol", "Terra Preta", "São José", "Liberdade"] },
  { cidade: "Coari", estado: "AM", bairros: ["Centro", "Urucu", "São Francisco", "Tauá-Mirim", "Cristo Rei"] },
  { cidade: "Tefé", estado: "AM", bairros: ["Centro", "Juruá", "Abial", "São João", "Vila Nova"] },
  { cidade: "Maués", estado: "AM", bairros: ["Centro", "Donga Michiles", "Aparecida", "Santa Luzia", "Cristo Rei"] },
  { cidade: "Tabatinga", estado: "AM", bairros: ["Centro", "Comara", "Ibirapuera", "Vila Verde", "Cidade Nova"] },
  { cidade: "Humaitá", estado: "AM", bairros: ["Centro", "São Pedro", "São Cristóvão", "Boa Vista", "Esperança"] },

  // --- Rondônia ---
  { cidade: "Cacoal", estado: "RO", bairros: ["Centro", "Princesa Isabel", "Floresta", "Jardim Clodoaldo", "Industrial"] },
  { cidade: "Rolim de Moura", estado: "RO", bairros: ["Centro", "Planalto", "Beira Rio", "São Cristóvão", "Industrial"] },
  { cidade: "Jaru", estado: "RO", bairros: ["Centro", "Setor 01", "Jardim dos Estados", "Savana", "Nova Jaru"] },
  { cidade: "Guajará-Mirim", estado: "RO", bairros: ["Centro", "Serraria", "Tamandaré", "Triângulo", "Dez de Abril"] },
  { cidade: "Pimenta Bueno", estado: "RO", bairros: ["Centro", "Pioneiros", "Alvorada", "Nova Pimenta", "Jardim das Oliveiras"] },

  // --- Tocantins ---
  { cidade: "Porto Nacional", estado: "TO", bairros: ["Centro", "Jardim dos Pássaros", "Aeroporto", "São Sebastião", "Vila Nova"] },
  { cidade: "Paraíso do Tocantins", estado: "TO", bairros: ["Centro", "Setor Bela Vista", "Jardim Paulista", "Vila Nova", "Setor Aeroporto"] },
  { cidade: "Colinas do Tocantins", estado: "TO", bairros: ["Centro", "Loteamento Bandeirantes", "Jardim das Palmeiras", "Vila Nova", "Setor Sul"] },
  { cidade: "Guaraí", estado: "TO", bairros: ["Centro", "Setor Aeroporto", "Vila Nova", "Jardim Paulista", "Setor Sul"] },

  // --- Acre / Roraima / Amapá ---
  { cidade: "Sena Madureira", estado: "AC", bairros: ["Centro", "Segundo Distrito", "Cidade Nova", "Bom Sucesso", "Niterói"] },
  { cidade: "Tarauacá", estado: "AC", bairros: ["Centro", "Triângulo", "São Francisco", "Praia da Base", "Aboca"] },
  { cidade: "Rorainópolis", estado: "RR", bairros: ["Centro", "Cidade Nova", "Vila União", "Setor Industrial", "Jardim Floresta"] },
  { cidade: "Caracaraí", estado: "RR", bairros: ["Centro", "São Francisco", "Cacau", "Vila Nova", "Vista Alegre"] },
  { cidade: "Laranjal do Jari", estado: "AP", bairros: ["Centro", "Agreste", "Cajari", "Nova Esperança", "Malvinas"] },
  { cidade: "Oiapoque", estado: "AP", bairros: ["Centro", "Universidade", "Parque das Palmeiras", "Infraero", "Planalto"] },
];
