var l = require('../lib/lambda');

function speedTest(adder) {
	var start = Date.now();
	for(var i = 0; i < 1000000; i++) {
		adder(i, i);
	}
	return Date.now() - start;
}

exports.verboseLambda = function(test) {
    test.expect(4);
    var adderNormal = function(a, b) { return a + b; };
    var adderLambda = l("a,b", "a+b");
    var adderVerboseLambda = l(function(a, b) { return a + b; });
    test.equal(adderNormal(1, 2), adderLambda(1, 2));
    test.equal(adderLambda(3, 4), adderVerboseLambda(3, 4));
    test.notEqual(adderNormal.pure, adderLambda.pure);
    test.equal(adderLambda.pure, adderVerboseLambda.pure);
    test.done();
};

exports.lambdaPurity = function(test) {
    test.expect(3);
    var foo = 'bar';
    var impureLambda = function() { return foo; };
    test.equal(impureLambda(), 'bar');
    test.throws(l('', 'foo'));
    test.throws(l(function() { return foo; }));
    test.done();
};

exports.serializer = function(test) {
    test.expect(1);
    test.doesNotThrow(function() {
        JSON.stringify(l.serialize(function foo(arg1, arg2) {
            return arg1 + arg2;
        }));
    });
    test.done();
};

exports.deserializer = function(test) {
    test.expect(2);
    var funcObj = l.serialize(function foo(arg1, arg2) {
        return arg1 + arg2;
    });
    test.doesNotThrow(function() {
        var func = l.deserialize(funcObj);
        test.equal(3, func(1, 2));
    });
    test.done();
};

exports.speed = function(test) {
	test.expect(3);
	var adderNormal = function(a, b) { return a + b; };
	var adderPreConstructed = new Function("a,b", "return a+b");
	var adderLambda = l("a,b", "a+b");
	
	var normalTime = speedTest(adderNormal);
	var preConstructedTime = speedTest(adderPreConstructed);
	var lambdaTime = speedTest(adderLambda);

	var naiveStart = Date.now();
	for(var i = 0; i < 1000000; i++) {
		(new Function("a,b", "return a+b"))(i, i);
	}
	var naiveTime = Date.now() - naiveStart;

	console.log("Naive Inline Function Construction Time: " + naiveTime + "ms");
	console.log("Pre-Constructed Function Time:           " + preConstructedTime + "ms");
	console.log("'Standard' Function Time:                " + normalTime + "ms");
	console.log("Lambda Function Time:                    " + lambdaTime + "ms");

	test.ok(lambdaTime < naiveTime, "'inline' construction of a lambda doesn't have normal inline penalty cost");
	test.ok(lambdaTime / preConstructedTime < 20, "lambda construction/retrieval overhead not significant");
	test.ok(lambdaTime / normalTime < 20, "lambda overhead not significant versus 'standard' functions");
	test.done();
};
