describe('The Learnful app', function() {
  'use strict';

  beforeEach(function() {
    module('learnful');
  });

  it('should have a valid config constant',
    inject(function(config) {
      expect(config.prod).toBe(false);
      expect(config.s3Media).toBeDefined();
      expect(config.firebase).toBeDefined();
    }
  ));
});
