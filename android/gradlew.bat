@echo off
setlocal
set GRADLE_HOME=%-dp0gradle
"%GRADLE_HOME%
\wrapper\dists\gradle-7.6.3-all\bin\gradle.bat" %*
