export function monetizationRoutes(controller,requireAuth){return [
  {method:'GET',path:'/api/monetization/me',middleware:[requireAuth],controller:controller.handle},
  {method:'GET',path:'/api/monetization/advanced',middleware:[requireAuth],controller:controller.handle},
  {method:'POST',path:'/api/monetization/premium',middleware:[requireAuth],controller:controller.handle},
  {method:'POST',path:'/api/monetization/sponsorship',middleware:[requireAuth],controller:controller.handle},
  {method:'POST',path:'/api/monetization/auctions/:id/participation',middleware:[requireAuth],controller:controller.handle},
  {method:'POST',path:'/api/monetization/mock/webhook',middleware:[],controller:controller.handle},
];}
