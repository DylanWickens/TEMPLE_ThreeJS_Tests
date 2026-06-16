#include ./functions/simplexNoise4d.glsl;

uniform float uSize;
uniform float uTime;
uniform float uNoisePeriod;
uniform float uNoiseSpeed;
uniform float uNoiseStrength;

attribute float aScale;

void main () {
    vec3 noiseSample = position * uNoisePeriod;

    float noiseX = simplexNoise4d(vec4(noiseSample + 0.0, uTime * uNoiseSpeed));
    float noiseY = simplexNoise4d(vec4(noiseSample + 17.3, uTime * uNoiseSpeed));
    float noiseZ = simplexNoise4d(vec4(noiseSample + 43.1, uTime * uNoiseSpeed));

    vec3 noiseOffset = vec3(noiseX, noiseY, noiseZ) * uNoiseStrength * aScale;
    vec3 displacedPosition = position + noiseOffset;

    vec4 modelPosition = modelMatrix * vec4(displacedPosition, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;

    // Pointsize
    gl_PointSize = uSize * aScale;
    gl_PointSize *= aScale / -viewPosition.z ;
}