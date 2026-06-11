#include ./functions/simplexNoise4d.glsl;

uniform float uSize;
uniform float uTime;
uniform float uNoisePeroid;
uniform float uNoiseSpeed;
uniform float uNoiseStrength;

attribute float aScale;

void main () {

    // Noise Offset 
    float noise = simplexNoise4d(vec4(
        position * uNoisePeroid, uTime * uNoiseSpeed
    ));

    vec3 displaced = position + normalize(position) * noise * uNoiseStrength;

    vec4 modelPosition = modelMatrix * vec4(displaced, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;

    // Pointsize
    gl_PointSize = uSize * aScale;
    gl_PointSize *= aScale / -viewPosition.z ;
}
