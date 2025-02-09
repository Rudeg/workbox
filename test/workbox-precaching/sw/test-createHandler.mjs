/*
  Copyright 2019 Google LLC

  Use of this source code is governed by an MIT-style
  license that can be found in the LICENSE file or at
  https://opensource.org/licenses/MIT.
*/

import {resetDefaultPrecacheController} from './resetDefaultPrecacheController.mjs';
import {spyOnEvent} from '../../../infra/testing/helpers/extendable-event-utils.mjs';

import {createHandler} from 'workbox-precaching/createHandler.mjs';
import {precache} from 'workbox-precaching/precache.mjs';

describe(`createHandler()`, function() {
  const sandbox = sinon.createSandbox();

  beforeEach(function() {
    sandbox.stub(self, 'addEventListener');
    resetDefaultPrecacheController();
  });

  afterEach(function() {
    sandbox.restore();
  });

  it(`should throw the expected error when there's a cache miss and fallbackToNetwork is false`, async function() {
    precache([]);
    const handler = createHandler(false);

    const event = new ExtendableEvent('fetch');
    spyOnEvent(event);

    return expectError(async () => {
      await handler({event, request: new Request('/cache-miss')});
    }, 'missing-precache-entry', (error) => {
      expect(error.details.url).to.eql(`${location.origin}/cache-miss`);
      expect(error.details.cacheName).to.eql(`workbox-precache-v2-${location.origin}/test/workbox-precaching/sw/`);
    });
  });

  it(`should return the expected handlerCallback for precached URLs`, async function() {
    // Simulate the following: first two handlerCallbacks have caches.match()
    // calls that return a hit. Third, and subsequent handlerCallback has a
    // caches.match() call that's a miss, which will lead to a call to fetch().
    const matchStub = sandbox.stub(self.caches, 'match')
        .onFirstCall().resolves(new Response('response 1'))
        .onSecondCall().resolves(new Response('response 2'))
        .resolves(undefined);

    const fetchStub = sandbox.stub(self, 'fetch')
        .onFirstCall().resolves(new Response('response 3'))
        .onSecondCall().resolves(new Response('response 4'));

    precache([
      '/url1',
      {url: '/url2', revision: 'abc123'},
      '/url3',
      {url: '/url4', revision: 'def456'},
    ]);

    const event = new ExtendableEvent('fetch');
    spyOnEvent(event);

    const handler = createHandler();
    const response1 = await handler({event, request: new Request('/url1')});

    expect(matchStub.calledOnce).to.be.true;
    expect(matchStub.firstCall.args[0].url).to.eql(`${location.origin}/url1`);
    expect(fetchStub.notCalled).to.be.true;
    expect(await response1.text()).to.eql('response 1');

    const response2 = await handler({event, request: new Request('/url2')});

    expect(matchStub.calledTwice).to.be.true;
    expect(matchStub.secondCall.args[0].url).to.eql(`${location.origin}/url2?__WB_REVISION__=abc123`);
    expect(fetchStub.notCalled).to.be.true;
    expect(await response2.text()).to.eql('response 2');

    const response3 = await handler({event, request: new Request('/url3')});

    expect(matchStub.calledThrice).to.be.true;
    expect(matchStub.thirdCall.args[0].url).to.eql(`${location.origin}/url3`);
    expect(fetchStub.calledOnce).to.be.true;
    expect(fetchStub.firstCall.args[0].url).to.eql(`${location.origin}/url3`);
    expect(await response3.text()).to.eql('response 3');

    const response4 = await handler({event, request: new Request('/url4')});

    expect(matchStub.callCount).to.eql(4);
    // Call #3 is the fourth call due to zero-indexing.
    expect(matchStub.getCall(3).args[0].url).to.eql(`${location.origin}/url4?__WB_REVISION__=def456`);
    expect(fetchStub.calledTwice).to.be.true;
    expect(fetchStub.secondCall.args[0].url).to.eql(`${location.origin}/url4`);
    expect(await response4.text()).to.eql('response 4');
  });
});
