import django,time,jwt,os
django.setup()
from django.contrib.auth import get_user_model
from users.models import IAMPrincipalBinding
from users.iam_identity import IAM_ISSUER
u=get_user_model().objects.create_user(username="e2e",email="e2e@example.invalid",password="unused")
IAMPrincipalBinding.objects.create(user=u,issuer=IAM_ISSUER,subject=str(u.pk))
open("/e2e/run/subject","w").write(str(u.pk))
open("/e2e/run/token","w").write(jwt.encode({"iss":IAM_ISSUER,"sub":str(u.pk),"aud":os.environ["JWT_AUDIENCE"],"exp":int(time.time())+7200,"type":"access","org_id":1001,"team_id":1,"roles":["user"],"permissions":[]},os.environ["JWT_SECRET"],algorithm="HS256"))
