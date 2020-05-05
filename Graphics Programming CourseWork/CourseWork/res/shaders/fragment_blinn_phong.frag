#version 330 core
in vec3 Position;
in vec3 Normal;
in vec2 TexCoord;
in vec4 fragPosFromLightPerspective;

layout( location = 0 ) out vec4 FragColor;

uniform vec3 CameraPosition;

struct DirectionalLight //positionless light that is coming from infinitely far
{
	vec3 position;
	vec3 color;
};

struct PointLight //"lightbulb" light, has a range and falloff logic
{
	vec4 pos;	
	vec3 color;
	float constantFall, linearFall, quadraticFall;
};

struct Material //The material this object is made of
{
	float ambient; //How much ambient light the object catches (approximated from directional light colour). SET THIS BETWEEN 0 AND 1.
	sampler2D diffuse; //Diffuse reflectivity
	sampler2D specular; //Specular reflectivity
	float shininess; // Specular shininess factor
};

uniform DirectionalLight dirLight;
uniform PointLight[3] lights;
uniform Material mat;
uniform sampler2D shadowMap;

//calculates whether the current fragment is in shadow by using depth testing from the directional light's perspective
float CalculateShadow()
{
	 //this line returns the coordinates of the fragment position from coord space to clip space (from -w, w) to (-1, 1)
	 vec3 projCoords = fragPosFromLightPerspective.xyz / fragPosFromLightPerspective.w; //this is necessary only for projection perspective, not orthogonal
	 projCoords = projCoords * 0.5 + 0.5; //normalise the depth between 0 and 1

	 float closestDepth = texture(shadowMap, projCoords.xy).r; //samples the closest depth point from the light's perspective
	 float currentDepth = projCoords.z;  //gets the depth of the current fragment

	 //we need to offset the depth of the fragment by an amount that depends on the angle between the light and the direction of the surface to avoid shadow-acne
	 float shadowOffset = max(0.008 * (1.0 - dot(Normal, -normalize(vec3(dirLight.position) - Position))), 0.005);
	 return currentDepth - shadowOffset > closestDepth ? 1.0 : 0.0; //if the current depth is greater than the minimum possible depth, it means the target is in shadow
}

vec3 CalculatePointLightContribution(PointLight light) //calculates the impact on the fragment for every light
{
	vec3 texelColor = vec3(texture(mat.diffuse, TexCoord)); //samples texture color in given fragment, used diffuse (and ambient) maps

	float distanceFromLight = length(light.pos.xyz - Position); //distance from light and light attenuation are used to determine the light's impact
	float lightAttenuation = 1.0 / (light.constantFall + light.linearFall * distanceFromLight + light.quadraticFall * (distanceFromLight * distanceFromLight));

	//CALC AMBIENT
	vec3 ambient = texelColor * mat.ambient;

	//CALC DIFFUSE
    vec3 lightDir = normalize(vec3(light.pos) - Position);
    float diffuseFactor = max(dot(Normal, vec3(light.pos)), 0.0); //diffusive factor, based on the angle of the light hitting each point on the surface

    vec3 diffuse = diffuseFactor * light.color * texelColor;

	//CALC SPECULAR
	vec3 viewDirection = normalize(CameraPosition - Position);	
	vec3 halfwayVector = normalize(lightDir + viewDirection); //blinn reflection, handles angles superior to 90 degrees
	float specularFactor = pow(max(dot(Normal, halfwayVector), 0.0), 1 * mat.shininess);
	
	vec3 specular = light.color * specularFactor * vec3(texture(mat.specular, TexCoord)); //we sample the specular factor from the specular map, set via uniform

	//Apply attenuation
	ambient *= lightAttenuation;
	diffuse *= lightAttenuation;
	specular *= lightAttenuation;

	return ambient + diffuse + specular;
}

vec3 CalculateDirectionalLightContribution() //There is no light attenuation for directional light
{
	//vec3 lightDir = normalize(-dirLight.direction.xyz); obtain correction if fed light direction from uniform
	vec3 lightDir = normalize(dirLight.position - Position);

	//AMBIENT
	vec3 ambient = mat.ambient * vec3(texture(mat.diffuse, TexCoord));
	
    // DIFFUSE
    float diffuseFactor = max(dot(Normal, lightDir), 0.0);

    // SPECULAR
    vec3 viewDirection = normalize(CameraPosition - Position);	
	vec3 halfwayVector = normalize(lightDir + viewDirection); //blinn reflection, handles angles superior to 90 degrees
	float specularFactor = pow(max(dot(Normal, halfwayVector), 0.0), 1 * mat.shininess);

	//COMBINING FACTORS
    vec3 diffuse  = dirLight.color * diffuseFactor * vec3(texture(mat.diffuse, TexCoord));
    vec3 specular = dirLight.color * specularFactor * vec3(texture(mat.specular, TexCoord));

	float shadow = CalculateShadow();
    return (ambient + (1.0 - shadow) * (diffuse + specular) * vec3(texture(mat.diffuse, TexCoord)));
}

void main()
{
	normalize(Normal);

	vec3 result = CalculateDirectionalLightContribution();

	for (int i = 0; i < lights.length; i++)
	{
		if(lights[i].constantFall == 0) {break;} //if we are iterating through an empty light, break
		result += CalculatePointLightContribution(lights[i]);
	}
	
	FragColor = vec4(result, 1.0);
}
