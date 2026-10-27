import { randomUUID } from 'node:crypto';
import { requireThat, text } from '../validation.mjs';

const now=()=>new Date().toISOString();
const prices={premium_subscription:99900,sponsored_listing:19900,auction_hosting:19900,auction_participation:4900};

export function createMonetizationService({model,provider,datasetModel,userModel,adminModel,auctionModel}) {
  const tx=fn=>datasetModel.transaction(fn);
  const active=userId=>{const e=model.entitlement(userId);return Boolean(e&&e.status==='active'&&e.expiresAt>now());};
  const targetOwned=(materialId,userId)=>datasetModel.ownerId(materialId)===userId;
  const activeMaterial=materialId=>datasetModel.load().materials.find(material=>material.id===materialId&&!material.archivedAt&&Number(material.quantityT)>0);
  const createAttempt=({payerUserId,productType,targetId,amountMinor})=>{
    const at=now();const intent=provider.createPaymentIntent({bookingId:targetId??productType,amountMinor,currency:'INR'});
    const row=model.createAttempt({payerUserId,productType,targetId,amountMinor,providerName:provider.name,providerReference:intent.providerReference,qrPayload:intent.qrPayload,at});
    provider.schedulePaymentResult({providerReference:intent.providerReference,amountMinor},deliver);
    return {...row,qrPayload:intent.qrPayload};
  };
  const grantPurchased=userId=>{
    const at=now();const previous=model.entitlement(userId);const start=previous?.status==='active'&&previous.expiresAt>at?previous.expiresAt:at;
    model.saveEntitlement({userId,source:'purchase',status:'active',startsAt:previous?.status==='active'?previous.startsAt:at,expiresAt:new Date(Date.parse(start)+MONTH).toISOString(),paymentAttemptId:model.attempts().find(a=>a.productType==='premium_subscription'&&a.payerUserId===userId&&a.status==='paid')?.id,updatedAt:at});
  };
  const deliver=(event,signature)=>recordWebhook(Buffer.from(JSON.stringify(event)),signature);
  const recordWebhook=(raw,signature)=>{
    requireThat(provider.verifyWebhook(raw,signature),'Invalid payment provider signature.',401);
    const event=JSON.parse(raw.toString());requireThat(event?.providerName===provider.name&&typeof event.eventId==='string'&&typeof event.providerReference==='string','Invalid payment event.',400);
    return tx(()=>{
      if(!model.recordEvent({eventId:event.eventId,providerName:provider.name,providerReference:event.providerReference,eventType:event.type,receivedAt:now(),payloadSha256:provider.payloadHash(raw)}))return {duplicate:true};
      const item=model.byProviderReference(event.providerReference);if(!item)return {ignored:true};
      if(['payment.captured','payment.failed'].includes(event.type)){
        if(item.status!=='pending'||event.amountMinor!==item.amountMinor)return {ignored:true};
        const updated=model.update(item.id,event.type==='payment.captured'?'paid':'failed',now());
        if(updated.status==='paid'){
          if(item.productType==='premium_subscription'){
            const previous=model.entitlement(item.payerUserId);const at=now();const base=previous?.status==='active'&&previous.expiresAt>at?new Date(previous.expiresAt):new Date(at);const day=base.getUTCDate();base.setUTCDate(1);base.setUTCMonth(base.getUTCMonth()+1);const finalDay=Math.min(day,new Date(Date.UTC(base.getUTCFullYear(),base.getUTCMonth()+1,0)).getUTCDate());base.setUTCDate(finalDay);
            model.saveEntitlement({userId:item.payerUserId,source:'purchase',status:'active',startsAt:previous?.status==='active'&&previous.expiresAt>at?previous.startsAt:at,expiresAt:base.toISOString(),paymentAttemptId:item.id,updatedAt:at});
          } else if(item.productType==='sponsored_listing') {
            const days=Number(item.targetId?.split(':').at(-1));const materialId=item.targetId?.split(':').slice(0,-1).join(':');
            if(materialId&&[7,14,30].includes(days)&&targetOwned(materialId,item.payerUserId)&&activeMaterial(materialId))model.createPlacement({materialId,providerUserId:item.payerUserId,paymentAttemptId:item.id,startsAt:now(),expiresAt:new Date(Date.now()+days*86400000).toISOString()});
            else if(materialId&&[7,14,30].includes(days)) { model.update(item.id,'refund_pending',now()); provider.createRefund({providerReference:item.providerReference,amountMinor:item.amountMinor},deliver); }
          } else if(item.productType==='auction_hosting') {
            const auction=auctionModel.byId(item.targetId);
            if(!auction||(auction.status==='cancelled'&&auction.hostingRefundable)) { model.update(item.id,'refund_pending',now());provider.createRefund({providerReference:item.providerReference,amountMinor:item.amountMinor},deliver); }
            else auctionModel.setHostingPaymentStatus(item.targetId,'paid',now());
          } else if(item.productType==='auction_participation') {
            const auction=auctionModel.byId(item.targetId);
            if(!auction||auction.status!=='open'||auction.endsAt<now()) { model.update(item.id,'refund_pending',now());provider.createRefund({providerReference:item.providerReference,amountMinor:item.amountMinor},deliver); }
            else model.saveParticipant({auctionId:item.targetId,userId:item.payerUserId,attemptId:item.id,status:'paid',joinedAt:now(),paidAt:now()});
          }
        } else if(item.productType==='auction_participation')model.saveParticipant({auctionId:item.targetId,userId:item.payerUserId,attemptId:item.id,status:'failed',joinedAt:item.createdAt});
      } else if(event.type==='refund.processed'||event.type==='refund.failed') {
        if(item.status!=='refund_pending'||event.amountMinor!==item.amountMinor)return {ignored:true};
        model.update(item.id,event.type==='refund.processed'?'refunded':'failed',now());
        if(item.productType==='auction_hosting'&&event.type==='refund.processed')auctionModel.setHostingPaymentStatus(item.targetId,'refunded',now());
      }
      return {processed:true};
    });
  };
  const latestAttempts=userId=>model.attempts().filter(item=>item.payerUserId===userId);
  const publicAttempt=item=>item&&({id:item.id,productType:item.productType,targetId:item.targetId,amountMinor:item.amountMinor,currency:item.currency,status:item.status,createdAt:item.createdAt,updatedAt:item.updatedAt,paidAt:item.paidAt,qrPayload:item.status==='pending'?item.qrPayload:undefined});

  return {
    recordWebhook,
    createPremiumAttempt(user){requireThat(adminModel.statusFor(user.id)==='active','This account is suspended.',403);if(active(user.id))requireThat(false,'Premium is already active.',409);const pending=model.attempts().find(a=>a.payerUserId===user.id&&a.productType==='premium_subscription'&&a.status==='pending');return {attempt:publicAttempt(pending??createAttempt({payerUserId:user.id,productType:'premium_subscription',amountMinor:prices.premium_subscription}))};},
    createSponsorship(user,materialId,days){requireThat(user.activeWorkspace==='provider'&&user.workspaces?.includes('provider'),'Switch to your Provider workspace.',403);requireThat(targetOwned(materialId,user.id),'You do not own this material.',403);requireThat([7,14,30].includes(Number(days)),'Choose 7, 14, or 30 days.',400);const material=activeMaterial(materialId);requireThat(material,'Only an active material listing can be sponsored.',409);const found=model.placements().find(p=>p.materialId===materialId&&p.status==='active'&&p.expiresAt>now());requireThat(!found,'This listing is already sponsored.',409);const prefix=`${materialId}:`;const pending=model.attempts().find(item=>item.productType==='sponsored_listing'&&item.targetId?.startsWith(prefix)&&item.payerUserId===user.id&&item.status==='pending');if(pending)return {attempt:publicAttempt(pending)};const targetId=`${materialId}:${Number(days)}`;const old=model.attemptForTarget('sponsored_listing',targetId,user.id);return {attempt:publicAttempt(old?.status==='pending'?old:createAttempt({payerUserId:user.id,productType:'sponsored_listing',targetId,amountMinor:Math.ceil(prices.sponsored_listing*Number(days)/7)}))};},
    joinAuction(user,auctionId){requireThat(user.activeWorkspace==='receiver'&&user.workspaces?.includes('receiver')&&user.receiverId,'Switch to your Receiver workspace.',403);requireThat(adminModel.statusFor(user.id)==='active','This account is suspended.',403);const auction=auctionModel.byId(auctionId);requireThat(auction&&auction.hostingPaymentStatus==='paid'&&auction.status==='open'&&auction.endsAt>=now(),'Auction is not open for participation.',409);requireThat(auction.providerUserId!==user.id,'The material Provider cannot join their auction.',403);const participant=model.participant(auctionId,user.id);if(participant?.status==='paid')return {joined:true};const pending=model.attemptForTarget('auction_participation',auctionId,user.id);const payment=pending??createAttempt({payerUserId:user.id,productType:'auction_participation',targetId:auctionId,amountMinor:prices.auction_participation});model.saveParticipant({auctionId,userId:user.id,attemptId:payment.id,status:'pending',joinedAt:participant?.joined_at??now()});return {joined:false,attempt:publicAttempt(payment)};},
    hasParticipation(auctionId,userId){return model.participantStatus(auctionId,userId)==='paid';},
    hostingAttempt(auctionId,userId){const item=model.attemptForTarget('auction_hosting',auctionId,userId);return publicAttempt(item);},
    afterAuctionCancel(auctionId,userId,refundable,reason='Provider cancelled auction before start'){
      auctionModel.setHostingRefundable(auctionId,refundable,now());
      const attempt=model.attemptForTarget('auction_hosting',auctionId,userId);if(!attempt||attempt.status!=='paid')return;
      if(!refundable)return {status:'not_refundable',reason:'Auction had already started.'};
      model.update(attempt.id,'refund_pending',now());
      provider.createRefund({providerReference:attempt.providerReference,amountMinor:attempt.amountMinor},deliver);
      return {status:'refund_pending',reason};
    },
    entitlement(user){const e=model.entitlement(user.id);return {plan:active(user.id)?'premium':'free',premium:active(user.id),expiresAt:active(user.id)?e.expiresAt:undefined,source:active(user.id)?e.source:undefined,attempts:latestAttempts(user.id).map(publicAttempt),placements:model.placements().filter(item=>item.providerUserId===user.id&&item.status==='active'&&item.expiresAt>now())};},
    listingMeta(materialId,providerUserId){const at=now();const e=model.entitlement(providerUserId);const premium=Boolean(e&&e.status==='active'&&e.expiresAt>at);const activePlacements=model.activePlacements(at);const materialCount=datasetModel.load().materials.filter(item=>!item.archivedAt).length;const slots=Math.min(5,Math.max(1,Math.ceil(materialCount*0.2)));const day=Math.floor(Date.now()/86400000);const offset=activePlacements.length?day%activePlacements.length:0;const rotated=[...activePlacements.slice(offset),...activePlacements.slice(0,offset)];const selected=new Set(rotated.slice(0,slots).map(item=>item.materialId));const placement=activePlacements.find(item=>item.materialId===materialId);return {premium,premiumExpiresAt:premium?e.expiresAt:undefined,sponsored:Boolean(placement&&selected.has(materialId)),sponsoredExpiresAt:placement?.expiresAt};},
    requirePremium(user){requireThat(active(user.id),'Premium subscription required.',403);},
    advancedReport(user){this.requirePremium(user);const dataset=datasetModel.load();const ownedMaterials=new Set(dataset.materials.filter(item=>datasetModel.ownerId(item.id)===user.id).map(item=>item.id));const ownedReceivers=new Set(dataset.receivers.filter(item=>datasetModel.ownerId(item.id)===user.id).map(item=>item.id));const relevant=dataset.bookings.filter(item=>ownedMaterials.has(item.materialId)||ownedReceivers.has(item.receiverId));const bookings=new Set(relevant.map(item=>item.id));const verified=(dataset.verifications??[]).filter(item=>bookings.has(item.bookingId)&&item.status==='verified');const acceptedT=verified.reduce((sum,item)=>sum+Math.max(0,Number(item.acceptedT)||0),0);const actualT=verified.reduce((sum,item)=>sum+Math.max(0,Number(item.actualT)||0),0);const surveyedT=dataset.materials.filter(item=>ownedMaterials.has(item.id)).reduce((sum,item)=>sum+Number(item.quantityT||0),0);return {surveyedT,verifiedAcceptedT:acceptedT,verifiedLoads:verified.length,acceptedRate:actualT?acceptedT/actualT:0};},
    adminList(user){const role=adminModel.roleFor(user.id);requireThat(['super_admin','operations_admin'].includes(role)&&adminModel.statusFor(user.id)==='active','Administrator access is required.',403);const at=now();model.expirePlacements(at);const result={entitlements:model.entitlements().map(item=>({...item,status:item.status==='active'&&item.expiresAt<=at?'expired':item.status})),attempts:model.attempts().map(({qrPayload,...row})=>row),placements:model.placements()};adminModel.appendAudit({actorUserId:user.id,actorRole:role,action:'inspect_monetization',targetType:'monetization',targetId:'all',occurredAt:at,reason:'Read-only monetization inspection',after:{attemptCount:result.attempts.length,entitlementCount:result.entitlements.length}});return result;},
    adminEntitlement(user,targetId,input){requireThat(adminModel.roleFor(user.id)==='super_admin'&&adminModel.statusFor(user.id)==='active','Super Admin access is required.',403);requireThat(userModel.findProfileById(targetId),'User not found.',404);const reason=text(input.reason,'reason',1000);const before=model.entitlement(targetId);const action=input.action;const at=now();let after;
      if(action==='revoke'){requireThat(before,'Premium entitlement not found.',404);after=model.saveEntitlement({...before,status:'revoked',updatedAt:at,grantedBy:user.id,reason,source:'admin_grant'});}
      else {const days=Number(input.days);requireThat(action==='grant'||action==='extend','Choose grant, extend, or revoke.',400);requireThat(Number.isInteger(days)&&days>=1&&days<=3650,'Expiry must be between 1 and 3650 days.',400);let expiresAt;if(input.expiresAt){const parsed=Date.parse(input.expiresAt);requireThat(Number.isFinite(parsed),'Enter a valid expiry date.',400);expiresAt=new Date(parsed).toISOString();}else {const base=before?.status==='active'&&before.expiresAt>at?Date.parse(before.expiresAt):Date.now();expiresAt=new Date(base+days*86400000).toISOString();}requireThat(expiresAt>at,'Expiry must be in the future.',400);after=model.saveEntitlement({userId:targetId,source:'admin_grant',status:'active',startsAt:before?.status==='active'&&before.expiresAt>at?before.startsAt:at,expiresAt,grantedBy:user.id,reason,updatedAt:at});}
      adminModel.appendAudit({actorUserId:user.id,actorRole:'super_admin',action:action==='revoke'?'revoke_premium':'grant_or_extend_premium',targetType:'user_entitlement',targetId,occurredAt:at,reason,before:before&&{status:before.status,source:before.source,expiresAt:before.expiresAt},after:{status:after.status,source:after.source,expiresAt:after.expiresAt}});return {entitlement:after};
    },
    createHostingAttempt(user,auctionId){const auction=auctionModel.byId(auctionId);requireThat(auction&&auction.providerUserId===user.id,'Auction not found.',404);return publicAttempt(model.attemptForTarget('auction_hosting',auctionId,user.id));},
    beginHosting(user,auction){const existing=model.attemptForTarget('auction_hosting',auction.id,user.id);if(existing?.status==='pending')return publicAttempt(existing);const attempt=createAttempt({payerUserId:user.id,productType:'auction_hosting',targetId:auction.id,amountMinor:prices.auction_hosting});return publicAttempt(attempt);},
    isPremium:active,
  };
}
