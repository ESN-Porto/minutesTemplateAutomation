/* 
   insert.js  –  All Google Docs API calls for
   building and filling the minutes template.
   DOM manipulation delegated to ui.js.
   */

function topicsRequests() {
    const result = [];
    for (let i = 0; i < topics.length; i++) {
        const type = (topics[i].Type)
            .replace('P', 'Presentation')
            .replace('D', 'Discussion')
            .replace('V', 'Voting')
            .replaceAll('/', ' / ');
        result.push({
            replaceAllText: {
                replaceText: `${i + 1}. ${topics[i].Title}\nType of Intervention - ${type}\nSpeaker - ${topics[i].Speaker}\n\n{{TOPICS}}`,
                containsText: { text: '{{TOPICS}}', matchCase: true },
            },
        });
    }
    result.push({
        replaceAllText: {
            replaceText: '',
            containsText: { text: '{{TOPICS}}', matchCase: true },
        },
    });
    return result;
}



function createInitialRequest() {
    return [
        { replaceAllText: { replaceText: date,                containsText: { text: '{{DATE}}',            matchCase: true } } },
        { replaceAllText: { replaceText: chair.mainChair,     containsText: { text: '{{MAIN CHAIR}}',      matchCase: true } } },
        { replaceAllText: { replaceText: nextChair.mainChair, containsText: { text: '{{NEXT MAIN CHAIR}}', matchCase: true } } },
        { replaceAllText: { replaceText: chair.speakers,      containsText: { text: '{{SPEAKERS}}',        matchCase: true } } },
        { replaceAllText: { replaceText: nextChair.speakers,  containsText: { text: '{{NEXT SPEAKERS}}',   matchCase: true } } },
        { replaceAllText: { replaceText: chair.minutes,       containsText: { text: '{{MINUTES}}',         matchCase: true } } },
        { replaceAllText: { replaceText: nextChair.minutes,   containsText: { text: '{{NEXT MINUTES}}',    matchCase: true } } },
        {
            replaceAllText: {
                replaceText: topics.map(t => t.Title).join('\n'),
                containsText: { text: '{{TOPIC LIST}}', matchCase: true },
            },
        },
        ...topicsRequests(),
    ];
}

function createRequest() {
    return [
        { replaceAllText: { replaceText: date,                containsText: { text: '{{DATE}}',                matchCase: true } } },
        { replaceAllText: { replaceText: start,               containsText: { text: '{{START}}',               matchCase: true } } },
        { replaceAllText: { replaceText: end,                 containsText: { text: '{{END}}',                 matchCase: true } } },
        { replaceAllText: { replaceText: members.length.toString(),    containsText: { text: '{{MEMBERS PRESENT}}',    matchCase: true } } },
        { replaceAllText: { replaceText: members.join(', '),           containsText: { text: '{{MEMBERS}}',           matchCase: true } } },
        { replaceAllText: { replaceText: newMembers.length.toString(), containsText: { text: '{{NEWMEMBERS PRESENT}}', matchCase: true } } },
        { replaceAllText: { replaceText: newMembers.join(', '),        containsText: { text: '{{NEWMEMBERS}}',        matchCase: true } } },
        { replaceAllText: { replaceText: parachutes.length.toString(), containsText: { text: '{{PARACHUTES PRESENT}}', matchCase: true } } },
        { replaceAllText: { replaceText: parachutes.join(', '),        containsText: { text: '{{PARACHUTES}}',        matchCase: true } } },
        { replaceAllText: { replaceText: externals.length.toString(),  containsText: { text: '{{EXTERNALS PRESENT}}', matchCase: true } } },
        { replaceAllText: { replaceText: externals.join(', '),         containsText: { text: '{{EXTERNALS}}',         matchCase: true } } },
        { replaceAllText: { replaceText: chair.mainChair,     containsText: { text: '{{MAIN CHAIR}}',      matchCase: true } } },
        { replaceAllText: { replaceText: nextChair.mainChair, containsText: { text: '{{NEXT MAIN CHAIR}}', matchCase: true } } },
        { replaceAllText: { replaceText: chair.speakers,      containsText: { text: '{{SPEAKERS}}',        matchCase: true } } },
        { replaceAllText: { replaceText: nextChair.speakers,  containsText: { text: '{{NEXT SPEAKERS}}',   matchCase: true } } },
        { replaceAllText: { replaceText: chair.minutes,       containsText: { text: '{{MINUTES}}',         matchCase: true } } },
        { replaceAllText: { replaceText: nextChair.minutes,   containsText: { text: '{{NEXT MINUTES}}',    matchCase: true } } },
        {
            replaceAllText: {
                replaceText: topics.map(t => t.Title).join('\n'),
                containsText: { text: '{{TOPIC LIST}}', matchCase: true },
            },
        },
        ...topicsRequests(),
    ];
}

//  Disable all generate controls while a request is in-flight 
function lockGenerateControls() {
    ['insert_button', 'insert_initial_button', 'fetch_button'].forEach(disableEl);
}
function unlockGenerateControls() {
    // Restore context-appropriate buttons – fetch buttons are always safe to re-enable
    enableEl('fetch_button');
}



//  insertData: uses copyId (set by copy.js) 
async function insertData(requestFunction) {
    try {
        await gapi.client.docs.documents.batchUpdate({
            documentId: copyId,
            resource: { requests: requestFunction() },
        });
    } catch (e) {
        console.error(e);
        showToast(`Could not write data to the document: ${e?.result?.error?.message ?? e}`, 'error');
        return;
    }

    // Apply bold formatting to topic headings
    let details;
    try {
        details = await gapi.client.docs.documents.get({ documentId: copyId });
    } catch (e) {
        console.error(e);
        return;
    }

    const boldRequests = [];
    for (let i = 19 + topics.length; i < (19 + 5 * topics.length); i += 4) {
        [
            [i,     details.result.body.content[i].startIndex,     details.result.body.content[i].endIndex],
            [i + 1, details.result.body.content[i + 1].startIndex, details.result.body.content[i + 1].startIndex + 22],
            [i + 2, details.result.body.content[i + 2].startIndex, details.result.body.content[i + 2].startIndex + 9],
        ].forEach(([, start, end]) => {
            boldRequests.push({
                updateTextStyle: {
                    textStyle: { bold: true },
                    fields: 'bold',
                    range: { startIndex: start, endIndex: end },
                },
            });
        });
    }

    try {
        await gapi.client.docs.documents.batchUpdate({
            documentId: copyId,
            resource: { requests: boldRequests },
        });
    } catch (e) {
        console.error(e);
    }
}

//  Generate handlers 
async function generateInitialMinutes() {
    lockGenerateControls();
    setLoading('insert_initial_button', true);
    try {
        await copyTemplate();
        await insertData(createInitialRequest);
        showToast('Initial minutes generated! 🎉', 'success');
        enableEl('redirect_button');
    } catch (e) {
        console.error(e);
        showToast('Something went wrong while generating the document.', 'error');
    } finally {
        setLoading('insert_initial_button', false);
        unlockGenerateControls();
        enableEl('insert_initial_button');
    }
}



async function generateMinutes() {
    lockGenerateControls();
    setLoading('insert_button', true);
    try {
        await copyTemplate();
        await insertData(createRequest);
        showToast('Minutes generated successfully! 🎉', 'success');
        enableEl('redirect_button');
    } catch (e) {
        console.error(e);
        showToast('Something went wrong while generating the document.', 'error');
    } finally {
        setLoading('insert_button', false);
        unlockGenerateControls();
        enableEl('insert_button');
    }
}

document.getElementById('insert_button').addEventListener('click', generateMinutes);
document.getElementById('insert_initial_button').addEventListener('click', generateInitialMinutes);