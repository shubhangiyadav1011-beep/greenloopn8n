export interface AuctionBidView { id:string; amountMinor:number; placedAt:string; bidder:string; isMine:boolean }
export interface AuctionAwardView { status:string; awardedAt:string; expiresAt:string; negotiationOfferId?:string; bookingId?:string; isCurrentUser:boolean }
export interface AuctionView {
  id:string; materialId:string; quantityT:number; startsAt:string; endsAt:string; minimumIncrement:number; minimumIncrementMinor:number;
  reservePrice?:number; reservePriceMinor?:number; status:string; createdAt:string; updatedAt:string; closedAt?:string;
  highestBidMinor?:number; nextBidMinor:number; reserveEnabled?:boolean; reserveMet?:boolean; myHighestBidMinor?:number;
  provider:{name:string;location:string}; material?:{id:string;type:string;condition:string;grade:string;quantityT:number;projectName?:string;location?:string;images?:string[]};
  winner?:{isCurrentUser:boolean}; negotiationOfferId?:string; bids?:AuctionBidView[]; awards?:AuctionAwardView[]; hostingPaymentStatus?:'pending'|'paid'|'refunded'; hostingFeeStatus?:string; participationStatus?:'paid'|'unpaid';
}
