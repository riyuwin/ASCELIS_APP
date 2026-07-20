[1mdiff --git a/ascelis_webapp/package-lock.json b/ascelis_webapp/package-lock.json[m
[1mindex 993e76a..243404b 100644[m
[1m--- a/ascelis_webapp/package-lock.json[m
[1m+++ b/ascelis_webapp/package-lock.json[m
[36m@@ -29,7 +29,7 @@[m
         "eslint-plugin-react-hooks": "^7.0.1",[m
         "eslint-plugin-react-refresh": "^0.4.24",[m
         "globals": "^16.5.0",[m
[31m-        "vite": "^5.4.0"[m
[32m+[m[32m        "vite": "^5.4.21"[m
       }[m
     },[m
     "node_modules/@babel/code-frame": {[m
[1mdiff --git a/ascelis_webapp/package.json b/ascelis_webapp/package.json[m
[1mindex 4e4a3f8..df029ae 100644[m
[1m--- a/ascelis_webapp/package.json[m
[1m+++ b/ascelis_webapp/package.json[m
[36m@@ -31,6 +31,6 @@[m
     "eslint-plugin-react-hooks": "^7.0.1",[m
     "eslint-plugin-react-refresh": "^0.4.24",[m
     "globals": "^16.5.0",[m
[31m-    "vite": "^5.4.0"[m
[32m+[m[32m    "vite": "^5.4.21"[m
   }[m
 }[m
[1mdiff --git a/ascelis_webapp/src/components/auth/LoginForm.jsx b/ascelis_webapp/src/components/auth/LoginForm.jsx[m
[1mindex c620a9a..16eb110 100644[m
[1m--- a/ascelis_webapp/src/components/auth/LoginForm.jsx[m
[1m+++ b/ascelis_webapp/src/components/auth/LoginForm.jsx[m
[36m@@ -143,7 +143,7 @@[m [mexport default function Login() {[m
           className="login-logo"[m
         />[m
 [m
[31m-        <h1 className="login-title">ASCELIS</h1>[m
[32m+[m[32m        <h1 className="login-title">ASCELIS123</h1>[m
         <p className="login-subtitle">Sign in to continue</p>[m
 [m
         <form onSubmit={handleSubmit}>[m
