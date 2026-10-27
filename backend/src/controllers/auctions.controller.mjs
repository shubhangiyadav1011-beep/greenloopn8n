import { readJsonBody } from '../middleware/validation.middleware.mjs';
import { sendJson } from './response.mjs';

export function createAuctionsController(auctionService) {
  return { async handle({req,res,path,params,user}) {
    const segments=path.split('/').filter(Boolean);
    let result;
    if(req.method==='GET'&&segments.length===2)result=auctionService.list(user);
    else if(req.method==='POST'&&segments.length===2)result=auctionService.create(user,await readJsonBody(req));
    else if(req.method==='GET'&&segments.length===3)result=auctionService.detail(user,params.id);
    else if(req.method==='PATCH'&&segments.length===3)result=auctionService.edit(user,params.id,await readJsonBody(req));
    else if(req.method==='DELETE'&&segments.length===3)result=auctionService.cancel(user,params.id);
    else if(req.method==='POST'&&segments.length===4&&segments[3]==='bids')result=auctionService.bid(user,params.id,(await readJsonBody(req)).amount);
    else if(req.method==='POST'&&segments.length===4&&segments[3]==='join')result=auctionService.join(user,params.id);
    else if(req.method==='POST'&&segments.length===4&&segments[3]==='hosting-payment')result=auctionService.hostingPayment(user,params.id);
    else if(req.method==='POST'&&segments.length===4&&segments[3]==='negotiation')result=auctionService.negotiation(user,params.id);
    else return false;
    sendJson(res,req.method==='POST'&&segments.length===2?201:200,result);return true;
  } };
}
