import zlib from "zlib";

/**
 * Creates a valid in-memory DOCX buffer containing text inside word/document.xml.
 */
export function createValidDocxBuffer(text: string): Buffer {
  const docXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r>
        <w:t>${text}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  const files = [
    { name: "[Content_Types].xml", data: Buffer.from(contentTypesXml, "utf-8") },
    { name: "word/document.xml", data: Buffer.from(docXml, "utf-8") },
  ];

  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf-8");
    const crc = zlib.crc32(file.data);

    // Local Header
    const local = Buffer.alloc(30);
    local.write("PK\x03\x04", 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // store (no compression)
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    localHeaders.push(local, nameBuf, file.data);

    // Central Directory Header
    const central = Buffer.alloc(46);
    central.write("PK\x01\x02", 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);

    centralHeaders.push(central, nameBuf);

    offset += local.length + nameBuf.length + file.data.length;
  }

  const centralDirOffset = offset;
  const centralDirSize = centralHeaders.reduce((sum, b) => sum + b.length, 0);

  const endRecord = Buffer.alloc(22);
  endRecord.write("PK\x05\x06", 0);
  endRecord.writeUInt16LE(0, 4);
  endRecord.writeUInt16LE(0, 6);
  endRecord.writeUInt16LE(files.length, 8);
  endRecord.writeUInt16LE(files.length, 10);
  endRecord.writeUInt32LE(centralDirSize, 12);
  endRecord.writeUInt32LE(centralDirOffset, 16);
  endRecord.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, endRecord]);
}

/**
 * Creates a valid minimal in-memory PDF buffer containing stream text.
 */
export function createValidPdfBuffer(text: string): Buffer {
  const content = `BT /F1 12 Tf 72 712 Td (${text}) Tj ET`;
  const pdfString = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj
4 0 obj<</Length ${content.length}>>stream
${content}
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000056 00000 n 
0000000111 00000 n 
0000000212 00000 n 
trailer<</Size 5/Root 1 0 R>>
startxref
${270 + content.length}
%%EOF`;
  return Buffer.from(pdfString, "utf-8");
}

/**
 * Creates a valid minimal in-memory PDF buffer with no extractable text (empty stream)
 * to test scanned PDF detection.
 */
export function createEmptyScannedPdfBuffer(): Buffer {
  const pdfString = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>/Contents 4 0 R>>endobj
4 0 obj<</Length 0>>stream
endstream endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000056 00000 n 
0000000111 00000 n 
0000000212 00000 n 
trailer<</Size 5/Root 1 0 R>>
startxref
250
%%EOF`;
  return Buffer.from(pdfString, "utf-8");
}

/** Creates a valid one-page PDF containing a 1x1 image and no text content. */
export function createImageOnlyPdfBuffer(): Buffer {
  const imageBytes = Buffer.from([0x80]);
  const content = Buffer.from("q 10 0 0 10 0 0 cm /Im1 Do Q", "utf-8");
  const header = Buffer.from("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n", "binary");
  const objects = [
    Buffer.from("1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n"),
    Buffer.from("2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n"),
    Buffer.from("3 0 obj\n<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<</XObject<</Im1 5 0 R>>>>/Contents 4 0 R>>\nendobj\n"),
    Buffer.concat([Buffer.from(`4 0 obj\n<</Length ${content.length}>>\nstream\n`), content, Buffer.from("\nendstream\nendobj\n")]),
    Buffer.concat([Buffer.from(`5 0 obj\n<</Type/XObject/Subtype/Image/Width 1/Height 1/ColorSpace/DeviceGray/BitsPerComponent 8/Length ${imageBytes.length}>>\nstream\n`), imageBytes, Buffer.from("\nendstream\nendobj\n")]),
  ];

  const offsets = [0];
  let length = header.length;
  for (const object of objects) {
    offsets.push(length);
    length += object.length;
  }
  const xrefOffset = length;
  const xref = ["xref\n0 6\n0000000000 65535 f \n", ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)].join("");
  const trailer = `trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.concat([header, ...objects, Buffer.from(xref + trailer)]);
}
