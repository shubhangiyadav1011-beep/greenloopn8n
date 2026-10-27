import { readJsonBody, readRawBody } from '../middleware/validation.middleware.mjs';
import { sendJson } from './response.mjs';

export function createMonetizationController(service) {
  return { async handle({req,res,path,params,user}) {
    let result;
    if(req.method==='GET'&&path==='/api/monetization/me')result=service.entitlement(user);
    else if(req.method==='GET'&&path==='/api/monetization/advanced')result=service.advancedReport(user);
    else if(req.method==='POST'&&path==='/api/monetization/premium')result=service.createPremiumAttempt(user);
    else if(req.method==='POST'&&path==='/api/monetization/sponsorship'){const body=await readJsonBody(req);result=service.createSponsorship(user,body.materialId,body.days);}
    else if(req.method==='POST'&&path==='/api/monetization/mock/webhook')result=service.recordWebhook(await readRawBody(req),req.headers['x-mock-provider-signature']);
    else if(req.method==='POST'&&params?.id&&path.endsWith('/participation'))result=service.joinAuction(user,params.id);
    else return false;
    sendJson(res,req.method==='POST'&&path!=='/api/monetization/mock/webhook'?201:200,result);return true;
  } };
}
