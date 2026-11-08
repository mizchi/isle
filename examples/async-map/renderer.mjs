import {project,WORLD} from './model.mjs';
const colors={cafe:'#43685b',food:'#9a6745',park:'#69874e',museum:'#69749b'};
export function createRenderer(canvas,image){
  const context=canvas.getContext('2d',{alpha:false});if(!context)throw new Error('Canvas is unavailable.');
  return {
    draw(state){
      const view=state.view,ratio=Math.min(devicePixelRatio||1,2),width=Math.round(view.width*ratio),height=Math.round(view.height*ratio);
      if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
      context.setTransform(ratio,0,0,ratio,0,0);context.fillStyle='#edf0e8';context.fillRect(0,0,view.width,view.height);
      if(image.complete&&image.naturalWidth){
        context.save();context.translate(view.width/2-view.x*view.scale,view.height/2-view.y*view.scale);context.scale(view.scale,view.scale);
        context.drawImage(image,0,0,WORLD.width,WORLD.height);context.restore();
      }
      for(const [index,place]of state.places.entries()){
        const point=project(place,view);if(point.x< -24||point.x>view.width+24||point.y< -24||point.y>view.height+24)continue;
        const selected=place.id===state.selected;
        if(selected){context.beginPath();context.arc(point.x,point.y-8,25,0,Math.PI*2);context.fillStyle='#ffffffb8';context.fill();}
        context.beginPath();context.moveTo(point.x,point.y+8);context.lineTo(point.x-11,point.y-7);context.lineTo(point.x+11,point.y-7);context.closePath();
        context.fillStyle=selected?'#c0793b':colors[place.category];context.fill();
        context.beginPath();context.arc(point.x,point.y-10,14,0,Math.PI*2);context.fill();
        context.strokeStyle='#fffef8';context.lineWidth=2;context.stroke();
        context.fillStyle='#fffef8';context.font='600 11px system-ui';context.textAlign='center';context.textBaseline='middle';context.fillText(String(index+1),point.x,point.y-10);
      }
    },
    hit(point,state){
      let found,nearest=22**2;
      for(const place of state.places){const p=project(place,state.view),distance=(p.x-point.x)**2+(p.y-10-point.y)**2;if(distance<nearest){nearest=distance;found=place.id;}}
      return found;
    },
  };
}
