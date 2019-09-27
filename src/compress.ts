import * as fs from 'fs';
import * as path from 'path';
import * as AdmZip from 'adm-zip';

export default async (folder, dest) => {
  const zip = new AdmZip();
  const files = await fs.promises.readdir(folder);
  for (const file of files) {
    const stats = await fs.promises.stat(path.join(folder, file));
    if (stats.isDirectory()) {
      await zip.addLocalFolder(path.join(folder, file), file);
    } else {
      await zip.addLocalFile(path.join(folder, file));
    }
  }
  return zip.writeZip(dest);
};
