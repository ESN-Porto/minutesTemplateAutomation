let copyId;

async function copyTemplate() {
    const response = await gapi.client.drive.files.copy({
        fileId: '11pmbCBgXJTeQYLWfFeWmij6OTD_NNZNMGJAaaGC0Mn4'
    });
    //console.log(response);
    copyId = response.result.id;
    //console.log(copyId)
}

