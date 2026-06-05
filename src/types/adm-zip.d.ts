declare module 'adm-zip' {
  export default class AdmZip {
    constructor(filename?: string);
    extractAllTo(targetPath: string, overwrite?: boolean): void;
  }
}
