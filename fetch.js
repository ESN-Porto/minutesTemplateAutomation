/* 
   fetch.js  –  Reads GM data from the Google
   Sheets spreadsheet.  
 */

let members;
let newMembers;
let parachutes;
let externals;
let topics;
let chair;
let start;
let end;
let date;
let nextChair;

function handleMembers(data, index) {
    //console.log(data[index].values);
    if (data[index].values === undefined) return [];
    return data[index].values
        .filter(member => member.length === 2 && member[1] === 'Present')
        .map(member => member[0]);
}

function handleHours(list) {
    return [list[0][0], list[list.length - 1][1]];
}

function handleNextChair(values, date) {
    for (let i = 0; i < values.length; i++) {
        if (values[i][0] === date) {
            return {
                mainChair: values[i][1],
                speakers:  values[i][2],
                minutes:   values[i][3],
            };
        }
    }
    return {
        mainChair: 'Could not find next chairing team in GM sheet.',
        speakers:  'Could not find next chairing team in GM sheet.',
        minutes:   'Could not find next chairing team in GM sheet.',
    };
}

function handleTopics(list) {
    const temp = [];
    list.forEach(topic => {
        if (topic.length === 0) return;
        temp.push({ Title: topic[0], Speaker: topic[1], Type: topic[2] });
    });
    return temp;
}

function handleChair(list) {
    if (list[5] === undefined) list[5] = [''];
    return { mainChair: list[1][0], speakers: list[3][0], minutes: list[5][0] };
}

async function fetchData() {
    const dateInputId = 'gm_day';

    const dateInput = document.getElementById(dateInputId).value;
    if (!dateInput) {
        showToast('Please select a GM date first.', 'error');
        return false;
    }

    date = dateInput;
    const [d, m, y] = date.split('/');
    const dateObj = new Date(y, m - 1, d);
    dateObj.setDate(dateObj.getDate() + 7);
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dateObj.getFullYear();
    const nextWeek = `${dd}/${mm}/${yyyy}`;

    const request = {
        spreadsheetId: CONFIG.SPREADSHEET_ID,
        ranges: [
            `'${date}'!A1:B57`, `'${date}'!C1:D57`, `'${date}'!E1:F57`,
            `'${date}'!I1:I7`, `'${date}'!J1:L40`, `'${date}'!M1:N40`,
            `'${date}'!G1:H57`, `'Chairing Teams'!B3:E100`,
        ],
    };

    try {
        const response = await gapi.client.sheets.spreadsheets.values.batchGet(request);
        const data = response.result.valueRanges;

        members    = handleMembers(data, 0);
        newMembers = handleMembers(data, 1);
        parachutes = handleMembers(data, 6);
        externals  = handleMembers(data, 2);
        chair      = handleChair(data[3].values);
        topics     = handleTopics(data[4].values);
        [start, end] = handleHours(data[5].values);
        nextChair  = handleNextChair(data[7].values, nextWeek);

        return true;

    } catch (err) {
        console.error(err);
        const msg = err?.result?.error?.message ?? 'Unknown error';
        showToast(`Error fetching data. Check that a sheet named "${date}" exists in the GM Agendas spreadsheet. (${msg})`, 'error');
        return false;
    }
}

async function populateDateSelectors() {
    //console.log("populateDateSelectors() execution started.");
    try {
        //console.log("Fetching spreadsheet data for ID:", CONFIG.SPREADSHEET_ID);
        const response = await gapi.client.sheets.spreadsheets.get({
            spreadsheetId: CONFIG.SPREADSHEET_ID
        });
        //console.log("Spreadsheet get response:", response);
        
        const sheets = response.result.sheets || [];
        //console.log("Total sheets found:", sheets.length);
        
        // Match dates like "23/02/2026", even if there are spaces or other text around it
        const dateRegex = /\d{1,2}\/\d{1,2}\/\d{4}/;
        const dateSheets = sheets
            .map(s => {
                const title = s?.properties?.title || "";
                //console.log("Sheet title checking:", title);
                return title;
            })
            .filter(title => {
                const matchesDate = dateRegex.test(title);
                const isGeneral = /chairing|volunteers|planner|template/i.test(title);
                const keep = matchesDate || (!isGeneral && title.length > 0);
                //if (keep) console.log("=> Keeping sheet:", title);
                return keep;
            });
            
        //console.log("Final filtered dateSheets:", dateSheets);
            
        const optionsHtml = '<option value="" disabled selected>Select a GM date...</option>' + 
            dateSheets.map(date => `<option value="${date}">${date}</option>`).join('');
            
        document.getElementById('gm_day').innerHTML = optionsHtml;
        //console.log("Updated innerHTML of gm_day with", dateSheets.length, "options.");
    } catch (err) {
        console.error('Error fetching sheet list', err);
        showToast('Failed to load GM dates from spreadsheet.', 'error');
    }
}