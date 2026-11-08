export interface Place {id:string;name:string;category:'cafe'|'food'|'park'|'museum';x:number;y:number;rating:number;address:string;description:string}
export interface Point {x:number;y:number}
export interface View extends Point {scale:number;width:number;height:number}
export type Category='all'|Place['category'];
export interface SearchRequest {query:string;category:Category;view:Readonly<View>}
export interface MapState {view:Readonly<View>;query:string;category:Category;places:readonly Readonly<Place>[];phase:'idle'|'loading'|'ready'|'error'|'disposed';error:string;selected:string;detail:Readonly<Place>|null;detailPhase:'idle'|'loading'|'ready'|'error';detailError:string;saved:readonly string[];disposed:boolean;stats:Readonly<{issued:number;aborted:number;stale:number;published:number}>}
export interface MapSession {readonly state:Readonly<MapState>;resize(width:number,height:number):void;pan(dx:number,dy:number):void;zoom(factor:number,point?:Point):void;reset():void;search(query:string,category:Category):Promise<boolean>;refresh():Promise<boolean>;select(id:string):Promise<boolean>;closeDetails():void;toggleSaved(id:string):void;dispose():boolean;settled():Promise<void>}
export function createMapSession(options:{search:(request:SearchRequest,signal:AbortSignal)=>Promise<unknown>;details:(id:string,signal:AbortSignal)=>Promise<unknown>;onChange?:(state:Readonly<MapState>)=>void}):MapSession;
export const WORLD:Readonly<{width:number;height:number}>;
export function project(point:Point,view:View):Point;
export function unproject(point:Point,view:View):Point;
export function zoomAt(view:View,factor:number,point?:Point):View;
export function validatePlaces(input:unknown):readonly Readonly<Place>[];
