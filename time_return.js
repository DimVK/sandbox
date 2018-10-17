var opacglobal = require('opacglobal');
var opac = new opacglobal.OpacGlobal();
var fs = require('fs');

var base_search = require('base_search');
base_search.opac = opac;

var listDebtors = [];
var objCfg;


//Cписок должников
function ListLease(listDebtors) {

	// метод удаления дублтрованых выдач
	this.DelDouble = function(listDebtors_delldouble){
		for (var d1 = 0; d1 < (listDebtors_delldouble.length - 1); d1++) {
			for (var d2 = (d1+1); d2 < (listDebtors_delldouble.length); d2++) {
				if (listDebtors_delldouble[d1] == listDebtors_delldouble[d2]) {
				listDebtors_delldouble.splice((d2), 1);
				}
			}
		}
		return listDebtors_delldouble;	
	};

	// метод группировки долгов по штрихкодам
	this.Group = function(listDebtors_group){
		for (var g1 = 0; g1 < (listDebtors_group.length); g1++) {
			var tek_str = listDebtors_group[g1].slice(0,listDebtors_group[g1].indexOf(";"));
			for (var x2 = (g1+1); x2 < (listDebtors_group.length); x2++) {
				var next_str = listDebtors_group[x2].slice(0,listDebtors_group[x2].indexOf(";"));
				// Если следующий штрихкод такой же
				if (tek_str == next_str) {
					var add_str = listDebtors_group[x2].slice((listDebtors_group[x2].lastIndexOf(";")+1),listDebtors_group[x2].length);	
					listDebtors_group[g1] = listDebtors_group[g1] +' | '+ add_str; 
					listDebtors_group.splice((g1+1), 1);
					x2--;
				}
			}
		}
		return listDebtors_group;	
	};	
	
	// метод фильтрации по email
	this.Filter = function(listDebtors_filter){
		for (var f1 = 0; f1 < (listDebtors_filter.length); f1++) {
			count = 0;
			position = listDebtors_filter[f1].indexOf(";");
			while ( position != -1 ) {
				count++;
				if (count == 2) {
					mailReader = listDebtors_filter[f1].slice(position+1,listDebtors_filter[f1].indexOf(";",position+1));
					if (mailReader == 'N/A') {
						listDebtors_filter.splice(f1, 1);
						f1--;
						break;
					}
				}
			position = listDebtors_filter[f1].indexOf(";",position+1);
			}
		}
		return listDebtors_filter;	
	};	
}

// Получение карточки читателя по id
function reader(id) {
  var query = new opacglobal.AdabasFindBuffer().encoding('windows-1251').and('ET', id).and('AW', 'READER');
  var cursor = new opacglobal.UserCursor(opac);
  var numRecordsFound = cursor.search(query);
  var readerRecord = cursor.read();
  cursor.close();
  return readerRecord;
}

// Получение данных книги по id
function book(id_book,dbase) {
  var query = new opacglobal.AdabasXFindBuffer('ID', id_book);
  var cursor = new opacglobal.MarcCursor(opac);
  var numRecordsFound = cursor.search(dbase, query);
  var record = cursor.read('OUTFORM.RUSMARC.BIBL.SHOTFORM');
  cursor.close();
  return record;
}

function lease(issuanceTransaction,endlease) {
	var leas_issuanceTransaction = [];
	var events_debt = [];
	var prevTime = new Date().getTime();
	for (var j = 0; j < issuanceTransaction.length; j++) {
		// Каждые 15 секунд выводим число обработанных записей.	
		var now = new Date().getTime();
		if (now - prevTime >= 15000) {
		console.log('Обработано записей: %d', j);
		
		
		
		prevTime = now;
		}
		if ((issuanceTransaction[j].id != '') && (issuanceTransaction[j].date != '') && (issuanceTransaction[j].note2 != '')) {
			// Запрос на формирование списка оперций с книгой, с привязкой по дате большей, или равной указанной
			var query_debt = new opacglobal.AdabasXFindBuffer('CO', '4001')
				.and('ID', issuanceTransaction[j].id)
				.and('DA', issuanceTransaction[j].date).suffix('GE');	

			events_debt = base_search.getData(query_debt);	

			//Сортировка по дате и времени в обратном порядке. Последние будут в начале списка
			events_debt.sort(function(a, b) {
			if (a.date === b.date) {
				return a.time > b.time ? -1 : (a.time < b.time ? 1 : 0);
			}
			return a.date > b.date ? -1 : (a.date < b.date ? 1 : 0);
			});
	
			// Анализ операции с самой поздней датой.
			if (events_debt.length > 0) {	
				// Если последняя операция - не списание и не электронная выдача, смотрим какому выдана книга
				if ((events_debt[0].note1 != objCfg.operations.opReturn)&&(events_debt[0].note1 != objCfg.operations.transferEl)) {
					// Если последняя операция - выдача этому читателю и дата операции совпадает с датой выдачи, значит книга не сдана!
					if ((events_debt[0].note3 == issuanceTransaction[j].note3)&&(events_debt[0].date == issuanceTransaction[j].date)&&(events_debt[0].note2 == issuanceTransaction[j].note2)) {
					leas_issuanceTransaction.push(events_debt[0]);	
						
					}
				}
			}
		}	
	}
	return leas_issuanceTransaction;
}


function transaction() {
// Даты начала и завершения поиска
  var reportRow = {};
  var end = new Date();
  var begin = new Date(end.toISOString().slice(0,4),end.toISOString().slice(5,7)-1,end.toISOString().slice(8,10),0,0,0,-Number(objCfg.dayTransfer));
  var endISO = end.toISOString().slice(0,4)+end.toISOString().slice(5,7)+end.toISOString().slice(8,10);
  var beginISO = begin.toISOString().slice(0,4)+begin.toISOString().slice(5,7)+begin.toISOString().slice(8,10); 
  
 
  
  var query = new opacglobal.AdabasXFindBuffer() 
	.and('CO', '4000').or('CO', '4001')
	.and('N1', objCfg.operations.transfer).or('N1', objCfg.operations.transferAbon).or('N1', objCfg.operations.transferMBA)
    .and('N3', 'USER\\0').suffix('GE')
    .and('N3', 'USER\\9').suffix('LT')	
	.and('DA', beginISO).to('DA', endISO);  
	
	reportRow.events = base_search.getData(query);  
	
// передаём массив записей в функцию lease 
var obligation = lease(reportRow.events,end);  
	//Создание списка должников
	for (var NoObl = 0; NoObl < obligation.length; NoObl++) {
		var io = '';
		reader_debt = reader(obligation[NoObl].note3);
		book_debt = book(obligation[NoObl].id,obligation[NoObl].db);
		// Проверка на нулевые значения
		if (reader_debt != null) {	
			if ((reader_debt.barcode != null)&&(reader_debt.fio != null)&&(obligation[NoObl].note4 != null)&&(reader_debt.type.toUpperCase() == '020НОВОСИБИРСКАЯ ГОНБ')) {
			// Отбрасываем фамилию
			for (var NoEl = 0; NoEl < reader_debt.fio.length; NoEl++) {
				if (reader_debt.fio.charAt(NoEl) == ' '){
				io = reader_debt.fio.substring(NoEl+1);	
				break;	
				}
			}
			io = reader_debt.fio;
				if (book(obligation[NoObl].id,obligation[NoObl].db) != null){
				// Условие, по которому определяется, сколько осталось дней до сдачи.

					var returnFund = eval("objCfg.fund."+obligation[NoObl].note2);

					if (returnFund != undefined){
						day = returnFund;						
					}	
					else{
						day = Number(objCfg.dayTwenty);
					}

					// Получаем дату, когда нужно вернуть книгу
					returnbook = new Date(obligation[NoObl].date.slice(0,4),obligation[NoObl].date.slice(4,6)-1,obligation[NoObl].date.slice(6,8),0,0,0,day);

					var distinctionDate = returnbook-end;

					//Разница в 2 дня 
					//if ((distinctionDate<=Number(objCfg.dayTwo))&&(distinctionDate>Number(objCfg.dayOne))){
					if ((distinctionDate<=172800000)&&(distinctionDate>0)){
						listDebtors.push(reader_debt.barcode+';'+io+';'+ reader_debt.email +';'+returnbook.toISOString().slice(0,10)+' - '+obligation[NoObl].note4+':'+book(obligation[NoObl].id,obligation[NoObl].db).slice(0,25));
					}				
				}
			}
		}		
	}	  
opac.close();
}




try {   
var cfgContent = fs.readFileSync("config.json", "utf8");
objCfg = JSON.parse(cfgContent);  
	} catch (err) {
	if (err) {
	  console.error(err.message);
	}
} 

var begin = new Date().getTime();
transaction();

var sp = new ListLease(listDebtors);

//Сотрировка по штрихкодам
listDebtors.sort();
// Удаление дублированых выдач 
var listDebtors_dell = sp.DelDouble(listDebtors);
//Группировка долгов читателей по штрихкодам  
var listDebtors_group = sp.Group(listDebtors_dell);
//Фильтр читетелей по email		
var listDebtors_filteremail = sp.Filter(listDebtors_group);



//Вывод списка читателей с email	
var now = new Date().toISOString();
for (var x = 0; x < listDebtors_filteremail.length; x++) {
	var temp = listDebtors_filteremail[x].replace('\n', '')+'\n';
	fs.appendFile('F:\\time_return\\send_list\\'+(String(now.slice(0, 10))+'email_srok.txt'),temp);
	}