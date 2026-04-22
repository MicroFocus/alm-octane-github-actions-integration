@echo off
setlocal

:: Set source and destination paths
set "source_folder=C:\dev\alm-octane-github-actions-integration\dist"
set "destination_folder=C:\dev\alm-octane-github-actions-tests\dist"
set "source_action_yml=C:\dev\alm-octane-github-actions-integration\action.yml"
set "destination_action_yml=C:\dev\alm-octane-github-actions-tests\action.yml"

:: Run npm build
call npm run build

:: Copy folder and its content
xcopy /E /I "%source_folder%" "%destination_folder%"
xcopy "%source_action_yml%" "%destination_action_yml%"

:: Navigate to the destination folder
cd /D "%destination_folder%"

:: Run git commands
git pull
git add .
git add ../action.yml
git commit -m "Updated integration"
git push

:: Print success message
echo Folder copied and changes pushed to Git repository.

:: End of script
