// src/components/InternshipList.js
import React, { useState, useEffect } from 'react';
import axios from 'axios';

const InternshipList = () => {
    const [internships, setInternships] = useState([]);

    useEffect(() => {
        const fetchInternships = async () => {
            try {
                const response = await axios.get('http://localhost:5000/api/emails');
                setInternships(response.data);
            } catch (error) {
                console.error("Error fetching internships", error);
            }
        };

        fetchInternships();
    }, []);

    return (
        <div>
            <h2>Internship Opportunities</h2>
            <ul>
                {internships.map((internship, index) => (
                    <li key={index}>
                        <h3>{internship.subject}</h3>
                        <p>{internship.snippet}</p>
                        <h4>Job Listings:</h4>
                        <ul>
                            {internship.jobsList.map((job, jobIndex) => (
                                <li key={jobIndex}>
                                    <strong>Title:</strong> {job.title} <br />
                                    <strong>Company:</strong> {job.company} <br />
                                    <strong>Location:</strong> {job.location} <br />
                                    <strong>Duration:</strong> {job.duration} <br />
                                    <strong>Salary:</strong> {job.salary} <br />
                                    <strong>Posted:</strong> {job.posted} <br />
                                    <strong>Links:</strong> 
                                    {Array.isArray(job.links) && job.links.length > 0 
                                        ? job.links.join(', ') 
                                        : job.url 
                                            ? job.url 
                                            : 'No links available'}
                                </li>
                        
                            ))}
                        </ul>
                    </li>
                ))}
            </ul>
        </div>
    );
};

export default InternshipList;