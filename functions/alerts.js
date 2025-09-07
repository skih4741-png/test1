import fetch from "node-fetch";

let cached = []; // in-memory (Netlify ephemeral). For persistence, use KV or Fauna.

export const handler = async (event)=>{
  if(event.httpMethod==="GET"){
    return {statusCode:200, body: JSON.stringify(cached)};
  }else if(event.httpMethod==="POST"){
    const body = JSON.parse(event.body||"[]");
    cached = body;
    return {statusCode:200, body: JSON.stringify({ok:true, count:cached.length})};
  }else{
    return {statusCode:405, body:"Method not allowed"};
  }
};
