var fs = require('fs');
var XMLHttpRequest = require('w3c-xmlhttprequest').XMLHttpRequest;
var marcrecord = require('marcrecord');
var opacglobal = require('opacglobal');
var MarcRecord = marcrecord.MarcRecord;


//Объект "библиографическая запись на электронный ресурс" 
function BRec(bibBody, bibId, bibUrl) {
	this.id = bibId;
	this.url = bibUrl;
	this.body = bibBody;
}
BRec.prototype = marcrecord;

// метод проверки на валидности доступа к документу
BRec.prototype.testValid = function (Url) {
	var client = new XMLHttpRequest();
	client.open('GET', Url + '/index.html', false);
	client.send();
	return client.status;
};

// метод сопоставления уровня готовности с доступом к документу
BRec.prototype.levelReadiness = function (status, leader) {
	if (status == 200) {
		// Проверка уровня готовности. Выставляем видимость(#)
		if (leader.length == 24) {
			if (leader.charCodeAt(17) != 32) {
				leader = leader.slice(0, 17) + String.fromCharCode(32) + leader.slice(18);
			}
		}
	}
	else {
		// Проверка уровня готовности. Скрываем от читателей(3)
		if (leader.length == 24) {
			if (leader.charCodeAt(17) != 51) {
				leader = leader.slice(0, 17) + String.fromCharCode(51) + leader.slice(18);
			}
		}
	}
	return leader;
};


function createReport(db) {
	var levelFull = [];
	var levelUnfinished = [];
	var query = new opacglobal.AdabasXFindBuffer();
	var cursor = new opacglobal.MarcCursor(opac);
	var numRecordsFound = cursor.search(db, query);
	var prevTime = new Date().getTime();

	for (var recNo = 0; biblRecordJson = cursor.read(); recNo++) {
		var now = new Date().getTime();
		if (now - prevTime >= 15000) {
			console.log('Обработано записей: %d', recNo);
			prevTime = now;
		}

		var biblRecord = marcrecord.parse(biblRecordJson);
		if (!biblRecord) {
			throw new Error('Bad record');
		}
		// Перебираем поля в записи.
		var f001 = biblRecord.getVariableFields('001');
		var f856 = biblRecord.getVariableFields('856');
		var leader = biblRecord.leader;
		for (var k = 0; k < f856.length; k++) {
			var f856u = f856[k].getSubfields('u');
			if ((f856u.length > 0) && ((f856u[0].data.length > 0))) {
				var fieldOfRec = new BRec(biblRecord, f001[0].data, f856u[0].data);
				var status = fieldOfRec.testValid(fieldOfRec.url);
				var controlLead = fieldOfRec.levelReadiness(status, leader);

				if (leader != controlLead) {
					if (controlLead.charCodeAt(17) == 32) {
						levelFull.push(f001[0].data + ' - ' + f856u[0].data);
						biblRecord.leader = controlLead;
						cursor.update(biblRecord);
					} else {
						levelUnfinished.push(f001[0].data + ' - ' + f856u[0].data);
						biblRecord.leader = controlLead;
						cursor.update(biblRecord);
					}
				}
			}
		}
	}

	console.log("Всего обработанно записей: ", numRecordsFound);
	console.log("Уровень готовности изменён на полный(#): ", levelFull.length);
	console.log("Уровень готовности изменён на незаконченный (3): ", levelUnfinished.length);

	fs.appendFile('\log.txt', "\n БД №: " + db +
		"\n Всего обработанно записей: " + numRecordsFound +
		"\n Уровень готовности изменён на полный(#): " + levelFull.length +
		"\n Уровень готовности изменён на незаконченный(3): " + levelUnfinished.length + '\n');


	levelFullResult = '';
	levelUnfinishedResult = '';


	//Вывод идентификаторов в лог
	if (levelFull.length > 0) {
		for (var pol = 0; pol < levelFull.length; pol++) {
			levelFullResult = levelFullResult + levelFull[pol] + '\n';
		}
		fs.appendFile('\log.txt', "\n BEGIN CHANGED # \n" + levelFullResult + "\n END CHANGED # \n");
	}
	if (levelUnfinished.length > 0) {
		for (var nez = 0; nez < levelUnfinished.length; nez++) {
			levelUnfinishedResult = levelUnfinishedResult + levelUnfinished[nez] + '\n';
		}
		fs.appendFile('\log.txt', "\n BEGIN CHANGED 3 \n" + levelUnfinishedResult + "\n END CHANGED 3 \n");
	}
	cursor.close();
}

function main() {
	opac = new opacglobal.OpacGlobal();

	try {
		var begin = new Date().toISOString();
		fs.appendFile('\log.txt', "\n Дата начала: " + begin.slice(0, 10) + " " + begin.slice(11, 19));

		var data = fs.readFileSync('\db.txt', 'utf8');
		var dbNumber = '';
		for (var dbN = 0; dbN < data.length; dbN++) {
			if (data[dbN] != '\n') {
				var dbNumber = dbNumber + data[dbN];
			}
			else {
				createReport(Number(dbNumber));
				dbNumber = '';
			}
		}
		var begin = new Date().toISOString();
		fs.appendFile('\log.txt', "\n Дата окончания: " + begin.slice(0, 10) + " " + begin.slice(11, 19));

	} catch (err) {
		if (err) {
			console.error(err.message);
		}
	}
	opac.close();
}

main();

