// Bounded virtual typed-record storage. No host I/O, paths, executable data or network.
export const deviceLimits=Object.freeze({files:32,records:4096,fields:256,string:4096,bytes:1048576,channels:15});
function nameOf(name){if(typeof name!=='string'||!/^[A-Za-z0-9][A-Za-z0-9 _.-]{0,63}$/.test(name)||name.includes('..'))throw Error('Invalid virtual file name');return name;}
function modeOf(mode){if(!['I','O'].includes(mode))throw Error('Unsupported device mode (use I or O)');return mode;}
function recordOf(values){if(!Array.isArray(values)||!values.length||values.length>deviceLimits.fields)throw Error('Device record field limit');for(const value of values)if(!(typeof value==='number'&&Number.isFinite(value)||typeof value==='string'&&value.length<=deviceLimits.string))throw Error('Invalid device field');return [...values];}
export class VirtualDevices {
 constructor(){this.files=new Map();this.channels=new Map();this.tapes=new Map();}
 validateSize(files){if(files.size>deviceLimits.files||JSON.stringify([...files]).length>deviceLimits.bytes)throw Error('Virtual storage limit');}
 prepare(name,mode){nameOf(name);modeOf(mode);if(mode==='I'&&!this.files.has(name))throw Error('Virtual file not found');if(mode==='O'){const next=new Map(this.files);next.set(name,[]);this.validateSize(next);this.files=next;}return {name,mode,position:0};}
 mount(name,mode='I',unit=-1){if(![-1,-2].includes(unit))throw Error('Cassette unit must be -1 or -2');this.tapes.set(unit,this.prepare(name,mode));}
 rewind(unit=-1){const tape=this.tapes.get(unit);if(!tape)throw Error('No cassette mounted');tape.position=0;tape.mode='I';}
 open(channel,mode,name){this.channelNumber(channel);if(this.channels.has(channel))throw Error('File already open');this.channels.set(channel,this.prepare(name,mode));}
 channelNumber(channel){if(!Number.isInteger(channel)||channel<1||channel>deviceLimits.channels)throw Error('Bad file number');}
 close(channel){if(channel===undefined){this.channels.clear();return;}this.channelNumber(channel);if(!this.channels.delete(channel))throw Error('File not open');}
 handle(channel,mode){const h=channel<0?this.tapes.get(channel):this.channels.get(channel);if(!h)throw Error(channel<0?'No cassette mounted':'File not open');if(h.mode!==mode)throw Error('Wrong device mode');return h;}
 write(channel,values){const h=this.handle(channel,'O'),record=recordOf(values),records=this.files.get(h.name);if(records.length>=deviceLimits.records)throw Error('Device record limit');const next=new Map(this.files);next.set(h.name,[...records,record]);this.validateSize(next);this.files=next;h.position++;}
 peek(channel,types){const h=this.handle(channel,'I'),record=this.files.get(h.name)[h.position];if(!record)throw Error('Out of file data (EOF)');if(record.length!==types.length||record.some((v,i)=>typeof v!==types[i]))throw Error('Bad file data: record count/type mismatch');return [...record];}
 advance(channel){this.handle(channel,'I').position++;}
 eof(channel){const h=this.handle(channel,'I');return h.position>=this.files.get(h.name).length;}
 catalog(){return {files:[...this.files].map(([name,records])=>({name,records:records.length})),tapes:[...this.tapes].map(([unit,h])=>({unit,...h})),channels:[...this.channels].map(([channel,h])=>({channel,...h}))};}
 export(){return JSON.stringify({format:'retrorealm-basic-devices',version:1,files:[...this.files].map(([name,records])=>({name,records}))});}
 import(text){if(typeof text!=='string'||text.length>deviceLimits.bytes*2)throw Error('Device image size limit');const data=JSON.parse(text);if(!data||Object.keys(data).sort().join(',')!=='files,format,version'||data.format!=='retrorealm-basic-devices'||data.version!==1||!Array.isArray(data.files))throw Error('Invalid device image');const next=new Map();for(const file of data.files){if(!file||Object.keys(file).sort().join(',')!=='name,records'||!Array.isArray(file.records)||file.records.length>deviceLimits.records)throw Error('Invalid virtual file');nameOf(file.name);if(next.has(file.name))throw Error('Duplicate virtual file');next.set(file.name,file.records.map(recordOf));}this.validateSize(next);this.files=next;this.channels.clear();this.tapes.clear();}
}
