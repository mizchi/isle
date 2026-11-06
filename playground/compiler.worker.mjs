import {compilePreview} from '@isle/prototype/compiler/browser';
self.onmessage=({data})=>{
  const {id,source,options}=data;
  try {self.postMessage({id,result:compilePreview(source,options)});}
  catch(error) {self.postMessage({id,error:String(error.message)});}
};
