#include ./functions/simplexNoise4d.glsl;

uniform float uSize;
uniform float uTime;


attribute float aScale;

void main () {

    vec4 modelPosition = modelMatrix * vec4(position, 1.0);
    vec4 viewPosition = viewMatrix * modelPosition;
    gl_Position = projectionMatrix * viewPosition;

    // Pointsize
    gl_PointSize = uSize * aScale;
    gl_PointSize *= aScale / -viewPosition.z ;
}