const fs=require('fs');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const src=html.split('/*CORE-START*/')[1].split('/*CORE-END*/')[0];
module.exports=new Function(src+';return Core;')();
