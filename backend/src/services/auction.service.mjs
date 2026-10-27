import { randomUUID } from 'node:crypto';
import { ApiError, requireThat, text } from '../validation.mjs';

const HOUR=60*60*1000;
const iso=value=>{const parsed=Date.parse(value);requireThat(typeof value==='string'&&Number.isFinite(parsed),'Enter a valid auction date and time.');return new Date(parsed).toISOString();};
const minor=value=>Math.round(Number(value)*100);

export function createAuctionService({auctionModel,datasetModel,datasetService,userModel,adminModel,negotiationModel,monetizationService}) {
  const eligible=(auction,userId)=>{
    const profile=userModel.findProfileById(userId);
    return Boolean(profile && adminModel.statusFor(userId)==='active' && profile.workspaces?.includes('receiver') && profile.receiverId && userId!==auction.providerUserId);
  };
  const prepareNegotiation=(auction,bid,at)=>{
    const dataset=datasetModel.load();
    const material=dataset.materials.find(item=>item.id===auction.materialId);
    const provider=userModel.findProfileById(auction.providerUserId);
    const receiver=userModel.findProfileById(bid.receiverUserId);
    requireThat(material && provider && receiver, 'Auction participant or material is unavailable.',409);
    const offerId=`AUCTION-OFFER-${randomUUID()}`;
    const demandId=`AUCTION-DEMAND-${randomUUID()}`;
    dataset.demands.push({id:demandId,receiverId:receiver.receiverId,materialType:material.type,requiredT:auction.quantityT,period:'9999-12-31',location:'',status:'DRAFT',createdAt:at,notes:'Set destination in Final Terms',auctionId:auction.id});
    dataset.offers.unshift({id:offerId,demandId,providerId:provider.email,passportId:material.id,offeredQuantityT:auction.quantityT,status:'pending',createdAt:at,pricePerT:bid.amountMinor/100,counters:[],auctionId:auction.id});
    datasetModel.assignOwner(demandId,bid.receiverUserId);
    datasetModel.save(dataset);
    negotiationModel.ensure(offerId,auction.providerUserId,bid.receiverUserId,at);
    auctionModel.linkNegotiation(auction.id,offerId,at);
    return offerId;
  };
  const hideExpiredNegotiation=(offerId,at)=>{
    if(!offerId)return;
    const dataset=datasetModel.load();
    const offer=dataset.offers.find(item=>item.id===offerId);
    if(offer?.status==='pending') dataset.offers=dataset.offers.map(item=>item.id===offerId?{...item,status:'withdrawn'}:item);
    const demand=offer && dataset.demands.find(item=>item.id===offer.demandId);
    if(demand)dataset.demands=dataset.demands.map(item=>item.id===demand.id?{...item,status:'CANCELLED'}:item);
    datasetModel.save(dataset);
  };
  const awardNext=(auction,at)=>{
    const candidates=auctionModel.bidsFor(auction.id);
    const attempted=new Set(auctionModel.awardsFor(auction.id).map(item=>item.receiverUserId));
    const bid=candidates.find(item=>!attempted.has(item.receiverUserId)&&eligible(auction,item.receiverUserId)&&(auction.reservePriceMinor==null||item.amountMinor>=auction.reservePriceMinor));
    if(!bid){auctionModel.setStatus(auction.id,'no_sale',at,at);return auctionModel.byId(auction.id);}
    auctionModel.setWinner(auction.id,bid.receiverUserId,bid.id,at);
    const expiresAt=new Date(Date.parse(at)+24*HOUR).toISOString();
    auctionModel.createAward({auctionId:auction.id,receiverUserId:bid.receiverUserId,bidId:bid.id,awardedAt:at,expiresAt});
    prepareNegotiation(auctionModel.byId(auction.id),bid,at);
    return auctionModel.byId(auction.id);
  };
  const expireAndClose=(auction,at)=>{
    if(!auction)return auction;
    if(auction.status==='scheduled'&&auction.startsAt<=at)auction=auctionModel.setStatus(auction.id,'open',at);
    if(['open','scheduled'].includes(auction.status)&&auction.endsAt<at){
      auctionModel.setStatus(auction.id,'closed',at,at);
      const bids=auctionModel.bidsFor(auction.id);
      const winner=bids.find(item=>eligible(auction,item.receiverUserId));
      if(winner && (auction.reservePriceMinor==null || winner.amountMinor>=auction.reservePriceMinor))return awardNext(auctionModel.byId(auction.id),at);
      return auctionModel.setStatus(auction.id,'no_sale',at,at);
    }
    if(auction.status==='awarded'){
      const award=auctionModel.currentAward(auction.id);
      if(award&&award.expiresAt<at){
        hideExpiredNegotiation(award.negotiationOfferId,at);
        auctionModel.expireAward(award.id,at);
        auctionModel.setStatus(auction.id,'award_expired',at);
        return awardNext(auctionModel.byId(auction.id),at);
      }
    }
    return auction;
  };
  const serialize=(auction,user,includeBids=true)=>{
    const dataset=datasetModel.load();
    const material=dataset.materials.find(item=>item.id===auction.materialId);
    const project=dataset.projects.find(item=>item.id===material?.projectId);
    const provider=userModel.findProfileById(auction.providerUserId);
    const allBids=auctionModel.bidsFor(auction.id);
    const bids=includeBids?allBids:[];
    const receiverLabels=new Map();
    for(const item of [...allBids].sort((a,b)=>a.placedAt.localeCompare(b.placedAt)||a.id.localeCompare(b.id)))if(!receiverLabels.has(item.receiverUserId))receiverLabels.set(item.receiverUserId,`Receiver ${receiverLabels.size+1}`);
    return { id:auction.id,materialId:auction.materialId,quantityT:auction.quantityT,startsAt:auction.startsAt,endsAt:auction.endsAt,minimumIncrementMinor:auction.minimumIncrementMinor,reservePriceMinor:auction.reservePriceMinor,status:auction.status,createdAt:auction.createdAt,updatedAt:auction.updatedAt,closedAt:auction.closedAt,
      minimumIncrement:auction.minimumIncrementMinor/100, reservePrice:auction.providerUserId===user.id&&auction.reservePriceMinor!=null?auction.reservePriceMinor/100:undefined,
      highestBidMinor:allBids[0]?.amountMinor, nextBidMinor:allBids.length?allBids[0].amountMinor+auction.minimumIncrementMinor:auction.minimumIncrementMinor,
      reserveEnabled:auction.reservePriceMinor!=null,reserveMet:auction.reservePriceMinor==null?undefined:Boolean(allBids[0]&&allBids[0].amountMinor>=auction.reservePriceMinor),
      provider:{name:provider?.organization||provider?.name||'Provider',location:provider?.location||project?.location||''},
      material:material?{id:material.id,type:material.type,condition:material.condition,grade:material.grade,quantityT:material.quantityT,projectName:project?.name,location:project?.location,images:material.evidence?.filter(item=>item.kind==='site-photo').map(item=>item.ref).filter(Boolean).slice(0,3)}:undefined,
      winner:auction.winnerUserId?{isCurrentUser:auction.winnerUserId===user.id}:undefined, hostingPaymentStatus:auction.hostingPaymentStatus,
      ...(auction.providerUserId===user.id?{hostingFeeStatus:monetizationService?.hostingAttempt(auction.id,user.id)?.status}:{}),
      participationStatus:monetizationService?.hasParticipation(auction.id,user.id)?'paid':'unpaid',
      negotiationOfferId:auction.providerUserId===user.id||auction.winnerUserId===user.id?auction.negotiationOfferId:undefined,
      myHighestBidMinor:bids.filter(item=>item.receiverUserId===user.id).reduce((highest,item)=>Math.max(highest,item.amountMinor),0)||undefined,
      ...(includeBids?{bids:bids.map(item=>({id:item.id,amountMinor:item.amountMinor,placedAt:item.placedAt,bidder:receiverLabels.get(item.receiverUserId),isMine:item.receiverUserId===user.id}))}:{}),
      awards:auctionModel.awardsFor(auction.id).map(item=>({status:item.status,awardedAt:item.awardedAt,expiresAt:item.expiresAt,negotiationOfferId:item.negotiationOfferId,bookingId:item.bookingId,isCurrentUser:item.receiverUserId===user.id})),
    };
  };
  const requireAccount=user=>requireThat(adminModel.statusFor(user.id)==='active','This account is suspended.',403);
  const requireWorkspace=(user,name)=>requireThat(user.workspaces?.includes(name)&&user.activeWorkspace===name,`Switch to your ${name} workspace to continue.`,403);
  const findOpenAuction=id=>{let auction=auctionModel.byId(id);requireThat(auction,'Auction not found.',404);auction=expireAndClose(auction,new Date().toISOString());return auction;};
  return {
    list(user){return datasetModel.transaction(()=>{requireAccount(user);requireThat(['provider','receiver'].includes(user.activeWorkspace),'A Provider or Receiver workspace is required.',403);const now=new Date().toISOString();const auctions=auctionModel.all().map(item=>expireAndClose(item,now)).filter(item=>user.activeWorkspace==='provider'?item.providerUserId===user.id:item.status!=='cancelled'&&item.hostingPaymentStatus==='paid').map(item=>serialize(item,user,false));return {auctions};});},
    detail(user,id){return datasetModel.transaction(()=>{requireAccount(user);requireThat(['provider','receiver'].includes(user.activeWorkspace),'A Provider or Receiver workspace is required.',403);const auction=findOpenAuction(id);requireThat(user.activeWorkspace==='provider'?auction.providerUserId===user.id:auction.hostingPaymentStatus==='paid','Auction not found.',404);return {auction:serialize(auction,user)};});},
    create(user,input){return datasetModel.transaction(()=>{
      requireAccount(user);requireWorkspace(user,'provider');
      const materialId=text(input.materialId,'material ID',250);requireThat(datasetModel.ownerId(materialId)===user.id,'You do not own this material.',403);
      const dataset=datasetModel.load();const material=dataset.materials.find(item=>item.id===materialId&&!item.archivedAt);requireThat(material,'Material not found.',404);
      const quantityT=Number(input.quantityT),minimumIncrementMinor=minor(input.minimumIncrement),reservePriceMinor=input.reservePrice==null||input.reservePrice===''?null:minor(input.reservePrice);
      requireThat(Number.isFinite(quantityT)&&quantityT>0,'Enter a valid auction quantity.');requireThat(Number.isSafeInteger(minimumIncrementMinor)&&minimumIncrementMinor>0,'Minimum bid increment must be greater than zero.');requireThat(reservePriceMinor==null||(Number.isSafeInteger(reservePriceMinor)&&reservePriceMinor>0),'Reserve price must be greater than zero.');
      const startsAt=iso(input.startsAt),endsAt=iso(input.endsAt),at=new Date().toISOString();requireThat(startsAt>=at&&endsAt>startsAt,'Choose a future start time and a later end time.');
      const committed=dataset.bookings.filter(item=>item.materialId===materialId&&item.status!=='cancelled').reduce((sum,item)=>sum+item.tonnesT,0);
      const auctionReserved=auctionModel.all().filter(item=>item.materialId===materialId&&['scheduled','open','closed','awarded','award_expired'].includes(item.status)).reduce((sum,item)=>sum+item.quantityT,0);
      requireThat(quantityT<=material.quantityT-committed-auctionReserved,'Auction quantity exceeds uncommitted available material.',409);
      const auction=auctionModel.create({materialId,providerUserId:user.id,quantityT,startsAt,endsAt,minimumIncrementMinor,reservePriceMinor,status:startsAt<=at?'open':'scheduled',createdAt:at});
      auctionModel.setHostingPaymentStatus(auction.id,'pending',at);
      const paymentAttempt=monetizationService.beginHosting(user,auctionModel.byId(auction.id));
      return {auction:serialize(auctionModel.byId(auction.id),user,false),paymentAttempt};
    });},
    edit(user,id,input){return datasetModel.transaction(()=>{requireAccount(user);requireWorkspace(user,'provider');let auction=findOpenAuction(id);requireThat(auction.providerUserId===user.id,'Auction not found.',404);const hasBids=auctionModel.bidsFor(id).length>0;requireThat(!hasBids,'Auction terms are locked after the first bid.',409);const dataset=datasetModel.load();const material=dataset.materials.find(item=>item.id===auction.materialId);requireThat(material,'Auction material is unavailable.',409);const committed=dataset.bookings.filter(item=>item.materialId===auction.materialId&&item.status!=='cancelled').reduce((sum,item)=>sum+item.tonnesT,0);const quantityT=Number(input.quantityT),increment=minor(input.minimumIncrement),reserve=input.reservePrice==null||input.reservePrice===''?null:minor(input.reservePrice);const startsAt=iso(input.startsAt),endsAt=iso(input.endsAt),at=new Date().toISOString();requireThat(Number.isFinite(quantityT)&&quantityT>0&&quantityT<=material.quantityT-committed-auctionModel.reservedForMaterial(auction.materialId,auction.id),'Invalid or unavailable auction quantity.');requireThat(Number.isSafeInteger(increment)&&increment>0&& (reserve==null||Number.isSafeInteger(reserve)&&reserve>0),'Invalid bid increment or reserve.');requireThat(endsAt>at&&endsAt>startsAt,'Invalid auction dates.');const updated=auctionModel.updateTerms(id,{quantityT,startsAt,endsAt,minimumIncrementMinor:increment,reservePriceMinor:reserve,status:startsAt<=at?'open':'scheduled',updatedAt:at});requireThat(updated,'Auction can no longer be edited.',409);return {auction:serialize(updated,user,false)};});},
    cancel(user,id){return datasetModel.transaction(()=>{requireAccount(user);requireWorkspace(user,'provider');const auction=findOpenAuction(id);requireThat(auction.providerUserId===user.id,'Auction not found.',404);requireThat(auctionModel.cancel(id,new Date().toISOString()),'An auction with bids cannot be cancelled.',409);const refund=monetizationService.afterAuctionCancel(id,user.id,auction.startsAt>new Date().toISOString());return {ok:true,refund};});},
    join(user,id){return monetizationService.joinAuction(user,id);},
    hostingPayment(user,id){return datasetModel.transaction(()=>{requireAccount(user);requireWorkspace(user,'provider');const auction=findOpenAuction(id);requireThat(auction.providerUserId===user.id,'Auction not found.',404);requireThat(['scheduled','open'].includes(auction.status)&&!auctionModel.bidsFor(id).length&&auction.hostingPaymentStatus!=='paid','Hosting payment cannot be restarted.',409);return {attempt:monetizationService.beginHosting(user,auction)};});},
    bid(user,id,amount){return datasetModel.transaction(()=>{requireAccount(user);requireWorkspace(user,'receiver');const auction=findOpenAuction(id);requireThat(auction.hostingPaymentStatus==='paid','Auction hosting fee has not been verified.',409);requireThat(eligible(auction,user.id),'Only an active Receiver who is not the material Provider can bid.',403);requireThat(monetizationService.hasParticipation(id,user.id),'Pay the one-time participation fee before bidding.',402);const at=new Date().toISOString();requireThat(auction.status==='open'&&auction.startsAt<=at&&at<=auction.endsAt,'This auction is not open for bidding.',409);const amountMinor=minor(amount);const highest=auctionModel.highestBid(id);const minimum=highest?highest.amountMinor+auction.minimumIncrementMinor:auction.minimumIncrementMinor;requireThat(Number.isSafeInteger(amountMinor)&&amountMinor>=minimum,'Bid must be at least the current minimum next bid.',409);const bid=auctionModel.addBid({auctionId:id,receiverUserId:user.id,amountMinor,placedAt:at});return {bid:{...bid,amount:bid.amountMinor/100},minimumNextBidMinor:bid.amountMinor+auction.minimumIncrementMinor};});},
    negotiation(user,id){const result=datasetModel.transaction(()=>{requireAccount(user);const auction=findOpenAuction(id);const award=auctionModel.currentAward(id);if(!(auction.status==='awarded'&&award&&[auction.providerUserId,award.receiverUserId].includes(user.id)&&award.expiresAt>=new Date().toISOString()))return undefined;return {offerId:award.negotiationOfferId,expiresAt:award.expiresAt};});requireThat(result,'Only the current auction winner and Provider can access this negotiation.',403);return result;},
    ensureOfferActive(offerId){const active=datasetModel.transaction(()=>{const auction=auctionModel.all().find(item=>item.negotiationOfferId===offerId);if(!auction||auction.status==='completed')return true;const current=expireAndClose(auction,new Date().toISOString());return current.status==='awarded'&&current.negotiationOfferId===offerId;});requireThat(active,'The 24-hour auction negotiation period has ended.',409);},
    assertOfferDeadline(offerId){const auction=auctionModel.all().find(item=>item.negotiationOfferId===offerId);if(!auction)return;const award=auctionModel.currentAward(auction.id);requireThat(auction.status==='awarded'&&award&&award.expiresAt>=new Date().toISOString(),'The 24-hour auction negotiation period has ended.',409);},
    completeForOffer(offerId,bookingId,at){const auction=auctionModel.all().find(item=>item.negotiationOfferId===offerId);if(!auction)return;const award=auctionModel.currentAward(auction.id);if(!award)return;auctionModel.completeAward(award.id,offerId,bookingId,at);auctionModel.linkBooking(auction.id,bookingId,at);},
    reservedT(materialId,excludeAuctionId){return auctionModel.reservedForMaterial(materialId,excludeAuctionId);},
    hasActive(materialId){return auctionModel.all().some(item=>item.materialId===materialId&&['scheduled','open','closed','awarded','award_expired'].includes(item.status));},
    adminList(){return datasetModel.transaction(()=>{const at=new Date().toISOString();return auctionModel.all().map(item=>expireAndClose(item,at)).map(auction=>{const bids=auctionModel.bidsFor(auction.id);const provider=userModel.findProfileById(auction.providerUserId);const material=datasetModel.load().materials.find(item=>item.id===auction.materialId);const awards=auctionModel.awardsFor(auction.id).map(award=>({ ...award,receiver:userModel.findProfileById(award.receiverUserId)?.email }));return {...auction,minimumIncrement:auction.minimumIncrementMinor/100,reservePrice:auction.reservePriceMinor==null?undefined:auction.reservePriceMinor/100,material:material?{id:material.id,type:material.type,quantityT:material.quantityT}:undefined,provider:provider?.email,bids:bids.map(bid=>({...bid,receiver:userModel.findProfileById(bid.receiverUserId)?.email})),awards};});});},
  };
}
