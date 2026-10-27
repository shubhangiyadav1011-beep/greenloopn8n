export function auctionsRoutes(controller,requireAuth){return [
  {method:'GET',path:'/api/auctions',middleware:[requireAuth],controller:controller.handle},
  {method:'POST',path:'/api/auctions',middleware:[requireAuth],controller:controller.handle},
  {method:'GET',path:'/api/auctions/:id',middleware:[requireAuth],controller:controller.handle},
  {method:'PATCH',path:'/api/auctions/:id',middleware:[requireAuth],controller:controller.handle},
  {method:'DELETE',path:'/api/auctions/:id',middleware:[requireAuth],controller:controller.handle},
  {method:'POST',path:'/api/auctions/:id/bids',middleware:[requireAuth],controller:controller.handle},
  {method:'POST',path:'/api/auctions/:id/join',middleware:[requireAuth],controller:controller.handle},
  {method:'POST',path:'/api/auctions/:id/hosting-payment',middleware:[requireAuth],controller:controller.handle},
  {method:'POST',path:'/api/auctions/:id/negotiation',middleware:[requireAuth],controller:controller.handle},
];}
