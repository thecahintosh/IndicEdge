import readXlsxFile from 'read-excel-file/web-worker';
self.onmessage = async event => {
  try {
    const sheets = await readXlsxFile(event.data, { trim: false });
    self.postMessage({ sheets });
  } catch { self.postMessage({ error: 'Workbook cannot be parsed. It may be damaged, password protected or not an XLSX file.' }); }
};
