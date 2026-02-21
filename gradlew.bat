@echo off
REM ----------------------------------------------------------------------
REM Gradle startup script for Windows
REM ----------------------------------------------------------------------

@REM Set local scope for variables
SETLOCAL

SET DIRNAME=%~dp0
IF "%DIRNAME%"=="" SET DIRNAME=.

SET APP_BASE_NAME=%~n0
SET APP_HOME=%DIRNAME%

IF NOT DEFINED JAVA_HOME goto findJavaFromPath

SET JAVA_EXE=%JAVA_HOME%\bin\java.exe
IF NOT EXIST "%JAVA_EXE%" (
  echo ERROR: JAVA_HOME is set to an invalid directory: %JAVA_HOME%
  exit /b 1
)

goto execute

:findJavaFromPath
SET JAVA_EXE=java
"%JAVA_EXE%" -version >NUL 2>&1
IF ERRORLEVEL 1 (
  echo ERROR: JAVA_HOME is not set and no 'java' could be found in your PATH.
  exit /b 1
)

:execute
SET CLASSPATH=%APP_HOME%\gradle\wrapper\gradle-wrapper.jar
"%JAVA_EXE%" -classpath "%CLASSPATH%" org.gradle.wrapper.GradleWrapperMain %*
